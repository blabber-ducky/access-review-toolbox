#Requires -Version 5.1
<#
.SYNOPSIS
    AD data dump — collects raw user, computer, group, and OU data.
    Analysis is handled separately by review.ps1.
#>
param(
    [Parameter(Mandatory)][string]$DumpPath,
    [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$errors    = [System.Collections.ArrayList]@()

function Write-Progress-Line { param([int]$Pct, [string]$Msg); Write-Host "PROGRESS:${Pct}:${Msg}" }

function Write-Manifest {
    param([string]$Status)
    $files = [System.Collections.ArrayList]@()
    foreach ($name in @('users.json','computers.json','groups.json','ous.json')) {
        $fp = Join-Path $DumpPath $name
        if (Test-Path $fp) {
            $files.Add(@{
                name        = $name
                recordCount = ((Get-Content $fp -Raw | ConvertFrom-Json) | Measure-Object).Count
                sizeBytes   = (Get-Item $fp).Length
            }) | Out-Null
        }
    }
    @{
        moduleId          = 'ad'
        moduleLabel       = 'Active Directory'
        timestamp         = (Get-Date -Format 'o')
        timestampFormatted= (Split-Path $DumpPath -Leaf)
        collectedBy       = "$env:USERDOMAIN\$env:USERNAME"
        hostname          = $env:COMPUTERNAME
        files             = $files
        durationSeconds   = [int]$stopwatch.Elapsed.TotalSeconds
        status            = $Status
        errors            = $errors
    } | ConvertTo-Json -Depth 10 | Out-File (Join-Path $DumpPath 'manifest.json') -Encoding UTF8
}

# ── 1. Import AD module ───────────────────────────────────────────────────────
Write-Progress-Line 2 'Loading ActiveDirectory module...'
try {
    Import-Module ActiveDirectory -ErrorAction Stop
} catch {
    $errors.Add("Failed to import ActiveDirectory module: $($_.Exception.Message)") | Out-Null
    Write-Manifest 'error'
    Write-Host "ERROR:ActiveDirectory module not available. Install RSAT or run on a domain-joined machine."
    exit 1
}

# ── 2. Users ──────────────────────────────────────────────────────────────────
Write-Progress-Line 5 'Collecting user accounts...'
try {
    $userProps = @(
        'SamAccountName','DisplayName','GivenName','Surname','EmailAddress',
        'Enabled','LockedOut','PasswordNeverExpires','PasswordExpired',
        'PasswordLastSet','LastLogonDate','AccountExpirationDate',
        'WhenCreated','WhenChanged','DistinguishedName','Department',
        'Title','Manager','UserPrincipalName','Description',
        'MemberOf','BadLogonCount','CannotChangePassword'
    )
    $users = Get-ADUser -Filter * -Properties $userProps | ForEach-Object {
        $u = $_
        [ordered]@{
            SamAccountName        = $u.SamAccountName
            DisplayName           = $u.DisplayName
            GivenName             = $u.GivenName
            Surname               = $u.Surname
            UserPrincipalName     = $u.UserPrincipalName
            EmailAddress          = $u.EmailAddress
            Enabled               = $u.Enabled
            LockedOut             = $u.LockedOut
            PasswordNeverExpires  = $u.PasswordNeverExpires
            PasswordExpired       = $u.PasswordExpired
            CannotChangePassword  = $u.CannotChangePassword
            BadLogonCount         = $u.BadLogonCount
            PasswordLastSet       = if ($u.PasswordLastSet) { $u.PasswordLastSet.ToString('o') } else { $null }
            LastLogonDate         = if ($u.LastLogonDate)   { $u.LastLogonDate.ToString('o') }   else { $null }
            AccountExpirationDate = if ($u.AccountExpirationDate) { $u.AccountExpirationDate.ToString('o') } else { $null }
            WhenCreated           = if ($u.WhenCreated) { $u.WhenCreated.ToString('o') } else { $null }
            WhenChanged           = if ($u.WhenChanged) { $u.WhenChanged.ToString('o') } else { $null }
            DistinguishedName     = $u.DistinguishedName
            Department            = $u.Department
            Title                 = $u.Title
            Description           = $u.Description
            MemberOf              = @($u.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=','' })
        }
    }
    $users | ConvertTo-Json -Depth 5 -AsArray | Out-File (Join-Path $DumpPath 'users.json') -Encoding UTF8
    Write-Progress-Line 25 "Collected $($users.Count) users"
} catch {
    $errors.Add("Users: $($_.Exception.Message)") | Out-Null
    Write-Progress-Line 25 'Users collection failed'
    '[]' | Out-File (Join-Path $DumpPath 'users.json') -Encoding UTF8
}

# ── 3. Computers ──────────────────────────────────────────────────────────────
Write-Progress-Line 27 'Collecting computer accounts...'
try {
    $compProps = @(
        'Name','DNSHostName','Enabled','OperatingSystem','OperatingSystemVersion',
        'LastLogonDate','WhenCreated','WhenChanged','DistinguishedName',
        'Description','MemberOf','IPv4Address'
    )
    $computers = Get-ADComputer -Filter * -Properties $compProps | ForEach-Object {
        $c = $_
        [ordered]@{
            Name                   = $c.Name
            DNSHostName            = $c.DNSHostName
            Enabled                = $c.Enabled
            OperatingSystem        = $c.OperatingSystem
            OperatingSystemVersion = $c.OperatingSystemVersion
            IPv4Address            = $c.IPv4Address
            Description            = $c.Description
            LastLogonDate          = if ($c.LastLogonDate) { $c.LastLogonDate.ToString('o') } else { $null }
            WhenCreated            = if ($c.WhenCreated) { $c.WhenCreated.ToString('o') } else { $null }
            WhenChanged            = if ($c.WhenChanged) { $c.WhenChanged.ToString('o') } else { $null }
            DistinguishedName      = $c.DistinguishedName
            MemberOf               = @($c.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=','' })
        }
    }
    $computers | ConvertTo-Json -Depth 5 -AsArray | Out-File (Join-Path $DumpPath 'computers.json') -Encoding UTF8
    Write-Progress-Line 50 "Collected $($computers.Count) computers"
} catch {
    $errors.Add("Computers: $($_.Exception.Message)") | Out-Null
    Write-Progress-Line 50 'Computers collection failed'
    '[]' | Out-File (Join-Path $DumpPath 'computers.json') -Encoding UTF8
}

# ── 4. Groups ─────────────────────────────────────────────────────────────────
Write-Progress-Line 52 'Collecting groups...'
try {
    $groups = Get-ADGroup -Filter * -Properties Members,Description,GroupCategory,GroupScope,WhenCreated,WhenChanged,MemberOf | ForEach-Object {
        $g = $_
        $memberNames = @()
        if ($g.Members) {
            $memberNames = @($g.Members | ForEach-Object {
                try {
                    $obj = Get-ADObject $_ -Properties SamAccountName
                    if ($obj.SamAccountName) { $obj.SamAccountName } else { ($_ -split ',')[0] -replace '^CN=','' }
                } catch { ($_ -split ',')[0] -replace '^CN=','' }
            })
        }
        [ordered]@{
            Name              = $g.Name
            SamAccountName    = $g.SamAccountName
            GroupCategory     = $g.GroupCategory.ToString()
            GroupScope        = $g.GroupScope.ToString()
            Description       = $g.Description
            MemberCount       = $memberNames.Count
            Members           = $memberNames
            MemberOf          = @($g.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=','' })
            WhenCreated       = if ($g.WhenCreated) { $g.WhenCreated.ToString('o') } else { $null }
            WhenChanged       = if ($g.WhenChanged) { $g.WhenChanged.ToString('o') } else { $null }
            DistinguishedName = $g.DistinguishedName
        }
    }
    $groups | ConvertTo-Json -Depth 5 -AsArray | Out-File (Join-Path $DumpPath 'groups.json') -Encoding UTF8
    Write-Progress-Line 75 "Collected $($groups.Count) groups"
} catch {
    $errors.Add("Groups: $($_.Exception.Message)") | Out-Null
    Write-Progress-Line 75 'Groups collection failed'
    '[]' | Out-File (Join-Path $DumpPath 'groups.json') -Encoding UTF8
}

# ── 5. OUs ────────────────────────────────────────────────────────────────────
Write-Progress-Line 77 'Collecting Organisational Units...'
try {
    $ous = Get-ADOrganizationalUnit -Filter * -Properties Description,WhenCreated,WhenChanged | ForEach-Object {
        $ou = $_
        $childCount = 0
        try { $childCount = (Get-ADObject -SearchBase $ou.DistinguishedName -SearchScope OneLevel -Filter *).Count } catch {}
        [ordered]@{
            Name              = $ou.Name
            Description       = $ou.Description
            ObjectCount       = $childCount
            WhenCreated       = if ($ou.WhenCreated) { $ou.WhenCreated.ToString('o') } else { $null }
            WhenChanged       = if ($ou.WhenChanged) { $ou.WhenChanged.ToString('o') } else { $null }
            DistinguishedName = $ou.DistinguishedName
        }
    }
    $ous | ConvertTo-Json -Depth 5 -AsArray | Out-File (Join-Path $DumpPath 'ous.json') -Encoding UTF8
    Write-Progress-Line 95 "Collected $($ous.Count) OUs"
} catch {
    $errors.Add("OUs: $($_.Exception.Message)") | Out-Null
    Write-Progress-Line 95 'OUs collection failed'
    '[]' | Out-File (Join-Path $DumpPath 'ous.json') -Encoding UTF8
}

# ── 6. Manifest ───────────────────────────────────────────────────────────────
Write-Progress-Line 98 'Writing manifest...'
Write-Manifest (if ($errors.Count -eq 0) { 'complete' } else { 'complete_with_errors' })
Write-Host "DONE:$DumpPath"
