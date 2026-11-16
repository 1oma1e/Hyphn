# Builds one Hyphn release (ADR-0040) into F:\Hyphn\out\v<version>\ :
#   - the signed Windows setup and latest.json (read by the PC updater),
#   - the iPhone .ipa, and source.json updated for SideStore.
# Then: create the GitHub Release v<version> and drop every file of that folder in it,
# and commit source.json.
#
# Usage (from the repo root, Hyphn closed):
#   powershell -NoProfile -File tools/release.ps1 -Notes "What changed"
# The .ipa is taken from F:\Hyphn\out\Hyphn_<iosversion>.ipa (copied from the build server).
param(
    [Parameter(Mandatory = $true)][string]$Notes,
    [string]$Key = 'F:\Hyphn\keys\hyphn-updater.key',
    [string]$OutRoot = 'F:\Hyphn\out'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$base = 'https://github.com/1oma1e/Hyphn/releases/download'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# PowerShell 5.1 writes odd JSON (wide indents, escaped quotes): Python tidies it.
function Write-Json($path, $obj) {
    [IO.File]::WriteAllText($path, ($obj | ConvertTo-Json -Depth 12), $utf8)
    python "$PSScriptRoot\tidy_json.py" $path
    if ($LASTEXITCODE) { throw "python could not tidy $path" }
}

if (-not (Test-Path $Key)) { throw "Signing key missing: $Key (without it, installed PCs cannot update)" }

$conf = Get-Content -Raw "$repo\apps\desktop\src-tauri\tauri.conf.json" | ConvertFrom-Json
$ver = $conf.version
[xml]$plist = Get-Content -Raw "$repo\apps\ios\Info.plist"
$keys = $plist.plist.dict.key
$vals = $plist.plist.dict.string
$iosVer = $vals[[array]::IndexOf($keys, 'CFBundleShortVersionString')]
$iosBuild = $vals[[array]::IndexOf($keys, 'CFBundleVersion')]
$ipa = Join-Path $OutRoot "Hyphn_$iosVer.ipa"
if (-not (Test-Path $ipa)) { throw "iPhone app missing: $ipa (build it on the server first)" }

# 1. Signed setup (the DLL webcam is built first by npm run build).
$env:TAURI_SIGNING_PRIVATE_KEY = $Key
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
Push-Location "$repo\apps\desktop"
try { npm run build; if ($LASTEXITCODE) { throw "npm run build failed ($LASTEXITCODE)" } }
finally { Pop-Location }

$target = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { "$repo\apps\desktop\src-tauri\target" }
$setupName = "Hyphn_${ver}_x64-setup.exe"
$setup = "$target\release\bundle\nsis\$setupName"
if (-not (Test-Path "$setup.sig")) { throw "No signature next to $setup" }

$out = Join-Path $OutRoot "v$ver"
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item $setup, $ipa $out -Force

# 2. latest.json for the PC updater.
$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Write-Json "$out\latest.json" ([ordered]@{
    version   = $ver
    notes     = $Notes
    pub_date  = $now
    platforms = [ordered]@{
        'windows-x86_64' = [ordered]@{
            signature = (Get-Content -Raw "$setup.sig").Trim()
            url       = "$base/v$ver/$setupName"
        }
    }
})

# 3. source.json for SideStore: newest version first, an older entry of the same version replaced.
$srcPath = "$repo\source.json"
$src = Get-Content -Raw $srcPath | ConvertFrom-Json
$app = $src.apps[0]
$entry = [pscustomobject][ordered]@{
    version              = $iosVer
    buildVersion         = $iosBuild
    date                 = (Get-Date).ToString('yyyy-MM-dd')
    localizedDescription = $Notes
    downloadURL          = "$base/v$ver/Hyphn_$iosVer.ipa"
    size                 = (Get-Item $ipa).Length
    minOSVersion         = '17.0'
}
$app.versions = @($entry) + @($app.versions | Where-Object { $_.version -ne $iosVer })
Write-Json $srcPath $src

Write-Host "Release v$ver ready in $out :"
Get-ChildItem $out | ForEach-Object { Write-Host "  $($_.Name)  $([math]::Round($_.Length / 1MB, 1)) MB" }
Write-Host "Next: GitHub Release v$ver with these files, then commit source.json."
