# Installs (or removes) the Hyphn Windows webcam and OBS source. ADR-0022.
# Built into the app (include_str!) and run as admin from there, once:
# Reglages > Webcam Windows > Installer. Never read from a folder the user
# can change: the app passes the SHA-256 of the DLLs it was built with, and
# each copy in Program Files is checked before it is registered.
param(
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$VcamSha256 = '',
    [string]$ObsSha256 = '',
    [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

$dest = Join-Path $env:ProgramFiles 'Hyphn'
$dll = Join-Path $dest 'hyphn_vcam.dll'
$obsExe = Join-Path $env:ProgramFiles 'obs-studio\bin\64bit\obs64.exe'
$obsPlugin = Join-Path $env:ProgramData 'obs-studio\plugins\hyphn-obs'
$obsBin = Join-Path $obsPlugin 'bin\64bit'
$obsDll = Join-Path $obsBin 'hyphn-obs.dll'
$logs = Join-Path $env:ProgramData 'Hyphn'
$regsvr = Join-Path $env:SystemRoot 'System32\regsvr32.exe'

# A DLL in use (camera open in an app) cannot be overwritten, but it can be
# renamed: the new one serves from the next opening.
function Retire([string]$path) {
    if (Test-Path $path) {
        $old = "$path.old-" + [DateTime]::Now.Ticks
        Move-Item $path $old -Force
        return $old
    }
    return $null
}
function Sweep([string]$dir) {
    Get-ChildItem $dir -Filter '*.old-*' -ErrorAction SilentlyContinue | ForEach-Object {
        try { Remove-Item $_.FullName -Force -ErrorAction Stop } catch { }
    }
}
# Copies next to the target, checks the hash, then swaps; the old file comes
# back if anything fails.
function Place([string]$from, [string]$to, [string]$sha) {
    $tmp = "$to.new"
    Copy-Item $from $tmp -Force
    $got = (Get-FileHash $tmp -Algorithm SHA256).Hash
    if (-not $sha -or $got -ne $sha.ToUpperInvariant()) {
        Remove-Item $tmp -Force
        exit 11
    }
    $old = Retire $to
    try { Move-Item $tmp $to -Force } catch {
        if ($old) { Move-Item $old $to -Force }
        exit 12
    }
    return $old
}

if ($Uninstall) {
    if (Test-Path $dll) {
        Start-Process $regsvr -ArgumentList '/s', '/u', "`"$dll`"" -Wait | Out-Null
        Retire $dll | Out-Null
    }
    Retire $obsDll | Out-Null
    foreach ($d in @($dest, $obsBin)) {
        Sweep $d
        try { Remove-Item $d -Recurse -Force -ErrorAction Stop } catch { }
    }
    try { Remove-Item $obsPlugin -Recurse -Force -ErrorAction Stop } catch { }
    try { Remove-Item $logs -Recurse -Force -ErrorAction Stop } catch { }
    exit 0
}

New-Item -ItemType Directory -Force $dest | Out-Null
Sweep $dest
$old = Place (Join-Path $Source 'hyphn_vcam.dll') $dll $VcamSha256
$p = Start-Process $regsvr -ArgumentList '/s', "`"$dll`"" -Wait -PassThru
if ($p.ExitCode -ne 0) {
    Remove-Item $dll -Force
    if ($old) { Move-Item $old $dll -Force }
    exit 10
}

# Diagnostic log (vcam.log): only the camera service (Local Service) writes
# there; everyone may read it. No picture, a few lines per use.
New-Item -ItemType Directory -Force $logs | Out-Null
& icacls.exe $logs /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null

if ((Test-Path $obsExe) -and $ObsSha256) {
    New-Item -ItemType Directory -Force $obsBin | Out-Null
    Sweep $obsBin
    Place (Join-Path $Source 'hyphn-obs.dll') $obsDll $ObsSha256 | Out-Null
}
exit 0
