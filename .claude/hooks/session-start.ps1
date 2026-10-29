# SessionStart: gives Claude docs/STATE.md and the result of the docs consistency check.
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Join-Path $PSScriptRoot '..\..'
$state = Join-Path $root 'docs\STATE.md'

if (Test-Path -LiteralPath $state) {
    Write-Output '=== docs/STATE.md ==='
    Get-Content -LiteralPath $state -Encoding UTF8 | Write-Output
} else {
    Write-Output 'docs/STATE.md is missing: ask Evan before doing anything else.'
}

$check = Join-Path $root 'tools\check-docs.ps1'
if (Test-Path -LiteralPath $check) {
    Write-Output ''
    Write-Output '=== tools/check-docs.ps1 ==='
    & powershell -NoProfile -ExecutionPolicy Bypass -File $check | Write-Output
}
exit 0
