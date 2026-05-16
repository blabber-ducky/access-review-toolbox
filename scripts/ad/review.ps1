#Requires -Version 5.1
<#
.SYNOPSIS
    AD review — analyses an existing dump and writes findings.json.
    Called automatically after dump, and by the Refresh button.
#>
param(
    [Parameter(Mandatory)][string]$DumpPath,
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

function Write-Progress-Line { param([int]$Pct, [string]$Msg); Write-Host "PROGRESS:${Pct}:${Msg}" }

function DaysSince {
    param([string]$iso)
    if (-not $iso) { return $null }
    try { ([datetime]::Now - [datetime]$iso).Days } catch { $null }
}

# ── Load dump files ───────────────────────────────────────────────────────────
Write-Progress-Line 5 'Loading dump data...'
$usersFile  = Join-Path $DumpPath 'users.json'
$groupsFile = Join-Path $DumpPath 'groups.json'
$ousFile    = Join-Path $DumpPath 'ous.json'

if (-not (Test-Path $usersFile)) {
    Write-Host 'ERROR:users.json not found in dump. Run a dump first.'
    exit 1
}

$users  = Get-Content $usersFile  -Raw | ConvertFrom-Json
$groups = if (Test-Path $groupsFile) { Get-Content $groupsFile -Raw | ConvertFrom-Json } else { @() }
$ous    = if (Test-Path $ousFile)    { Get-Content $ousFile    -Raw | ConvertFrom-Json } else { @() }

$generatedAt = Get-Date -Format 'o'
$findings    = [System.Collections.ArrayList]@()

# ── 1. Enabled users with no login >= 90 days ─────────────────────────────────
Write-Progress-Line 15 'Checking stale enabled accounts...'
$items = @($users | Where-Object {
    $_.Enabled -eq $true -and (DaysSince $_.LastLogonDate) -ge 90
})
$findings.Add([ordered]@{
    findingTypeId = 'stale-enabled'
    label         = 'Enabled users with no login >= 90 days'
    severity      = 'high'
    count         = $items.Count
    generatedAt   = $generatedAt
    note          = $null
    items         = $items
}) | Out-Null

# ── 2. Disabled users >= 180 days (WhenChanged as proxy) ─────────────────────
Write-Progress-Line 30 'Checking long-disabled accounts...'
$items = @($users | Where-Object {
    $_.Enabled -eq $false -and (DaysSince $_.WhenChanged) -ge 180
})
$findings.Add([ordered]@{
    findingTypeId = 'long-disabled'
    label         = 'Disabled users >= 180 days'
    severity      = 'medium'
    count         = $items.Count
    generatedAt   = $generatedAt
    note          = 'Age is based on WhenChanged (last-modified date), used as a proxy because AD does not record the exact disable date.'
    items         = $items
}) | Out-Null

# ── 3. Accounts set to never expire ──────────────────────────────────────────
Write-Progress-Line 45 'Checking accounts set to never expire...'
$items = @($users | Where-Object {
    $_.Enabled -eq $true -and (-not $_.AccountExpirationDate)
})
$findings.Add([ordered]@{
    findingTypeId = 'never-expire-acct'
    label         = 'Accounts set to never expire'
    severity      = 'medium'
    count         = $items.Count
    generatedAt   = $generatedAt
    note          = $null
    items         = $items
}) | Out-Null

# ── 4. Accounts with password never expire ────────────────────────────────────
Write-Progress-Line 58 'Checking password never-expire...'
$items = @($users | Where-Object { $_.PasswordNeverExpires -eq $true })
$findings.Add([ordered]@{
    findingTypeId = 'never-expire-pwd'
    label         = 'Accounts with password set to never expire'
    severity      = 'medium'
    count         = $items.Count
    generatedAt   = $generatedAt
    note          = $null
    items         = $items
}) | Out-Null

# ── 5. Groups with no members ─────────────────────────────────────────────────
Write-Progress-Line 72 'Checking empty groups...'
$items = @($groups | Where-Object { $_.MemberCount -eq 0 })
$findings.Add([ordered]@{
    findingTypeId = 'empty-groups'
    label         = 'Groups with no members'
    severity      = 'low'
    count         = $items.Count
    generatedAt   = $generatedAt
    note          = $null
    items         = $items
}) | Out-Null

# ── 6. OUs with no objects ────────────────────────────────────────────────────
Write-Progress-Line 85 'Checking empty OUs...'
$items = @($ous | Where-Object { $_.ObjectCount -eq 0 })
$findings.Add([ordered]@{
    findingTypeId = 'empty-ous'
    label         = 'OUs with no objects'
    severity      = 'low'
    count         = $items.Count
    generatedAt   = $generatedAt
    note          = $null
    items         = $items
}) | Out-Null

# ── Write findings.json ───────────────────────────────────────────────────────
Write-Progress-Line 96 'Writing findings.json...'
$findings | ConvertTo-Json -Depth 10 -AsArray | Out-File (Join-Path $DumpPath 'findings.json') -Encoding UTF8

Write-Progress-Line 100 "Review complete — $($findings.Count) finding types evaluated"
Write-Host "DONE:$DumpPath"
