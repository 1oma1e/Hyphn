# Builds the native parts of the PC app (ADR-0022):
#   hyphn_vcam.dll  - the Windows webcam (apps/desktop-vcam)
#   hyphn-obs.dll   - the OBS source (apps/obs-plugin)
# into apps/desktop/src-tauri/native/ (the app embeds the SHA-256 of these
# DLLs at build time, see build.rs, and installs them itself: install.rs).
# Needs the MSVC Build Tools (F:\BuildTools) and the Windows SDK.
# Usage: powershell -NoProfile -File tools/build-native.ps1
param([switch]$NoObs)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vcvars = Get-ChildItem 'F:\BuildTools' -Recurse -Filter vcvars64.bat -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $vcvars) { throw 'vcvars64.bat not found under F:\BuildTools' }

$src = Join-Path $root 'apps\desktop-vcam\src'
$obs = Join-Path $root 'apps\obs-plugin\src'
$out = Join-Path $root 'apps\desktop\src-tauri\native'
$base = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $env:TEMP 'hyphn' }
$obj = Join-Path $base 'native-obj'
New-Item -ItemType Directory -Force $out, $obj | Out-Null

# /MT: no Visual C++ runtime needed on the PC (the Frame Server loads the DLL).
# /Brepro: same bytes at every build, so the SHA-256 the app checks (build.rs)
# does not change when nothing changed.
$cl = '/nologo /std:c++20 /EHsc /O2 /MT /W3 /DUNICODE /D_UNICODE /DNOMINMAX /utf-8 /Brepro'
$libs = 'mfplat.lib mf.lib mfuuid.lib mfsensorgroup.lib d3d11.lib dxgi.lib d2d1.lib dwrite.lib ole32.lib oleaut32.lib advapi32.lib propsys.lib user32.lib bcrypt.lib'

$steps = @(
    "cd /d `"$src`"",
    "rc /nologo /fo `"$obj\feed.res`" feed.rc",
    "cl $cl /c /Fo`"$obj\\`" feed.cpp vcam.cpp",
    "link /nologo /Brepro /DLL /DEF:vcam.def /OUT:`"$out\hyphn_vcam.dll`" `"$obj\feed.obj`" `"$obj\vcam.obj`" `"$obj\feed.res`" $libs"
)
if (-not $NoObs) {
    $steps += @(
        "cd /d `"$obs`"",
        "lib /nologo /Brepro /def:obs.def /machine:x64 /out:`"$obj\obs.lib`"",
        "cl $cl /I`"$src`" /c /Fo`"$obj\obs\\`" plugin.cpp `"$src\feed.cpp`"",
        "link /nologo /Brepro /DLL /OUT:`"$out\hyphn-obs.dll`" `"$obj\obs\plugin.obj`" `"$obj\obs\feed.obj`" `"$obj\feed.res`" `"$obj\obs.lib`" $libs"
    )
    New-Item -ItemType Directory -Force (Join-Path $obj 'obs') | Out-Null
}
$cmd = "call `"$($vcvars.FullName)`" >nul && " + ($steps -join ' && ')
cmd /c $cmd
if ($LASTEXITCODE -ne 0) { throw "native build failed ($LASTEXITCODE)" }
Remove-Item (Join-Path $out '*.exp'), (Join-Path $out '*.lib') -ErrorAction SilentlyContinue
Get-ChildItem $out | Select-Object Name, Length
Write-Output 'build-native: OK'
