# Deterministic docs consistency check (the part of /session-start and /session-end a script can do).
# Checks: required files, [[wikilinks]] resolve, every ADR has a status and is in the ADR index,
# STATE.md has a next step, CLAUDE.md stays under 200 lines. Exit 1 when something is wrong.
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less scripts as ANSI.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$docs = Join-Path $root 'docs'
$problems = New-Object System.Collections.Generic.List[string]

$required = @('CLAUDE.md', 'docs\00-Accueil.md', 'docs\CAHIER.md', 'docs\STATE.md', 'docs\VISION.md',
    'docs\ROADMAP.md', 'docs\ARCHITECTURE.md', 'docs\RULES.md', 'docs\decisions\Decisions - Index.md')
foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { $problems.Add("missing file: $file") }
}

$notes = Get-ChildItem -LiteralPath $docs -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.obsidian\\' }
$names = @{}
foreach ($note in $notes) {
    $names[$note.BaseName.ToLowerInvariant()] = $true
    $names[$note.Name.ToLowerInvariant()] = $true
}

foreach ($note in ($notes | Where-Object { $_.Extension -eq '.md' })) {
    $inFence = $false
    $lineNumber = 0
    foreach ($line in (Get-Content -LiteralPath $note.FullName -Encoding UTF8)) {
        $lineNumber++
        if ($line.TrimStart().StartsWith('```')) { $inFence = -not $inFence; continue }
        if ($inFence) { continue }
        $prose = [regex]::Replace($line, '`[^`]*`', '')  # inline code shows link syntax, it is not a link
        foreach ($match in [regex]::Matches($prose, '\[\[([^\]]+)\]\]')) {
            $target = ($match.Groups[1].Value -split '[|#]')[0].Trim()
            $leaf = ($target -split '/')[-1].ToLowerInvariant()
            if ($leaf -and -not $names.ContainsKey($leaf)) {
                $relative = $note.FullName.Substring($root.Length + 1)
                $problems.Add("broken link [[$target]] in ${relative}:$lineNumber")
            }
        }
    }
}

$adrIndex = Join-Path $docs 'decisions\Decisions - Index.md'
$indexText = if (Test-Path -LiteralPath $adrIndex) { Get-Content -LiteralPath $adrIndex -Raw -Encoding UTF8 } else { '' }
foreach ($adr in (Get-ChildItem -LiteralPath (Join-Path $docs 'decisions') -Filter 'ADR-*.md' -File)) {
    $text = Get-Content -LiteralPath $adr.FullName -Raw -Encoding UTF8
    if ($text -notmatch '(?m)^statut:\s*\S+') { $problems.Add("ADR without 'statut:' : $($adr.Name)") }
    if (-not $indexText.Contains($adr.BaseName)) { $problems.Add("ADR not listed in Decisions - Index: $($adr.Name)") }
}

$state = Join-Path $docs 'STATE.md'
if (Test-Path -LiteralPath $state) {
    $stateText = Get-Content -LiteralPath $state -Raw -Encoding UTF8
    if ($stateText -notmatch '(?ms)^## Prochaine[^\n]*\n\s*\S') { $problems.Add('STATE.md: section "## Prochaine etape" missing or empty') }
}

$claude = Join-Path $root 'CLAUDE.md'
if (Test-Path -LiteralPath $claude) {
    $count = (Get-Content -LiteralPath $claude -Encoding UTF8).Count
    if ($count -ge 200) { $problems.Add("CLAUDE.md has $count lines (limit 200)") }
}

if ($problems.Count -eq 0) {
    Write-Output 'check-docs: OK'
    exit 0
}
Write-Output "check-docs: $($problems.Count) problem(s)"
$problems | ForEach-Object { Write-Output "- $_" }
exit 1
