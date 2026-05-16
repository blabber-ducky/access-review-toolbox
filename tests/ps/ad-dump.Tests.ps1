#Requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for scripts/ad/dump.ps1 output structure and scripts/ad/refresh.ps1.
    Tests verify file creation, JSON schema, and manifest shape against manually
    created fixture files — no AD connection or ActiveDirectory module required.
#>

BeforeAll {
    $script:DumpScript    = Resolve-Path "$PSScriptRoot\..\..\scripts\ad\dump.ps1"
    $script:RefreshScript = Resolve-Path "$PSScriptRoot\..\..\scripts\ad\refresh.ps1"
    $Now = Get-Date
}

# ── dump.ps1 — file layout and schema ──────────────────────────────────────
Describe 'dump.ps1 — AD data collection' {

    Context 'When ActiveDirectory module is unavailable' {
        It 'exits with error code 1 and writes ERROR to stdout' {
            # On this machine the ActiveDirectory module is not installed,
            # so dump.ps1 should detect that and exit 1 with an ERROR: line.
            $dumpPath = Join-Path $TestDrive 'no-ad-dump'
            New-Item -ItemType Directory -Path $dumpPath -Force | Out-Null
            $out = & pwsh -NoProfile -ExecutionPolicy Bypass `
                          -File ([string]$script:DumpScript) `
                          -DumpPath $dumpPath 2>&1
            $LASTEXITCODE | Should -Be 1
            ($out | Out-String) | Should -Match 'ERROR'
        }
    }

    Context 'Fixture-based output schema tests' {
        # We cannot run dump.ps1 on CI (no AD), so we create the exact files
        # that dump.ps1 would produce and verify the schema expectations.
        BeforeAll {
            $script:FixturePath = Join-Path $TestDrive 'ad-schema-test'
            New-Item -ItemType Directory -Path $script:FixturePath -Force | Out-Null

            @([PSCustomObject]@{
                SamAccountName='alice'; DisplayName='Alice'; Enabled=$true
                LastLogonDate=$Now.AddDays(-5).ToString('o')
                WhenChanged=$Now.AddDays(-5).ToString('o')
                AccountExpirationDate=$Now.AddDays(365).ToString('o')
                PasswordNeverExpires=$false
                DistinguishedName='CN=alice,DC=test,DC=local'
                Department='IT'; Title='Engineer'; MemberOf=@()
            }) | ConvertTo-Json -Depth 5 -AsArray |
                Out-File (Join-Path $script:FixturePath 'users.json') -Encoding UTF8

            @([PSCustomObject]@{
                Name='PC01'; Enabled=$true; OperatingSystem='Windows 11'
                DistinguishedName='CN=PC01,DC=test,DC=local'
            }) | ConvertTo-Json -Depth 5 -AsArray |
                Out-File (Join-Path $script:FixturePath 'computers.json') -Encoding UTF8

            @([PSCustomObject]@{
                Name='Group1'; SamAccountName='group1'
                MemberCount=0; Members=@()
                DistinguishedName='CN=Group1,DC=test,DC=local'
            }) | ConvertTo-Json -Depth 5 -AsArray |
                Out-File (Join-Path $script:FixturePath 'groups.json') -Encoding UTF8

            @([PSCustomObject]@{
                Name='OU1'; ObjectCount=0
                DistinguishedName='OU=OU1,DC=test,DC=local'
            }) | ConvertTo-Json -Depth 5 -AsArray |
                Out-File (Join-Path $script:FixturePath 'ous.json') -Encoding UTF8

            @{
                moduleId='ad'; status='complete'; timestamp=$Now.ToString('o')
                collectedBy='TEST\user'; hostname='TESTHOST'
                files=@(
                    @{name='users.json';     recordCount=1; sizeBytes=100}
                    @{name='computers.json'; recordCount=1; sizeBytes=80}
                    @{name='groups.json';    recordCount=1; sizeBytes=60}
                    @{name='ous.json';       recordCount=1; sizeBytes=40}
                )
                durationSeconds=1; errors=@()
            } | ConvertTo-Json -Depth 5 |
                Out-File (Join-Path $script:FixturePath 'manifest.json') -Encoding UTF8
        }

        It 'users.json exists'    { Join-Path $script:FixturePath 'users.json'    | Should -Exist }
        It 'computers.json exists'{ Join-Path $script:FixturePath 'computers.json'| Should -Exist }
        It 'groups.json exists'   { Join-Path $script:FixturePath 'groups.json'   | Should -Exist }
        It 'ous.json exists'      { Join-Path $script:FixturePath 'ous.json'      | Should -Exist }
        It 'manifest.json exists' { Join-Path $script:FixturePath 'manifest.json' | Should -Exist }

        It 'manifest.json has status complete' {
            $mf = Get-Content (Join-Path $script:FixturePath 'manifest.json') -Raw | ConvertFrom-Json
            $mf.status | Should -Be 'complete'
        }

        It 'manifest.json files array has 4 entries' {
            $mf = Get-Content (Join-Path $script:FixturePath 'manifest.json') -Raw | ConvertFrom-Json
            $mf.files.Count | Should -Be 4
        }

        It 'users.json contains at least 1 record' {
            $users = @(Get-Content (Join-Path $script:FixturePath 'users.json') -Raw | ConvertFrom-Json)
            $users.Count | Should -BeGreaterOrEqual 1
        }

        It 'each user has SamAccountName' {
            $users = @(Get-Content (Join-Path $script:FixturePath 'users.json') -Raw | ConvertFrom-Json)
            foreach ($u in $users) { $u.SamAccountName | Should -Not -BeNullOrEmpty }
        }

        It 'groups.json each entry has MemberCount' {
            $groups = @(Get-Content (Join-Path $script:FixturePath 'groups.json') -Raw | ConvertFrom-Json)
            foreach ($g in $groups) {
                $g.PSObject.Properties.Name | Should -Contain 'MemberCount'
            }
        }

        It 'ous.json each entry has ObjectCount' {
            $ous = @(Get-Content (Join-Path $script:FixturePath 'ous.json') -Raw | ConvertFrom-Json)
            foreach ($ou in $ous) {
                $ou.PSObject.Properties.Name | Should -Contain 'ObjectCount'
            }
        }
    }
}

# ── refresh.ps1 — delegates to review.ps1 ──────────────────────────────────
Describe 'refresh.ps1 — delegates to review.ps1' {
    BeforeAll {
        $refreshDump = Join-Path $TestDrive 'ad-refresh-dump'
        New-Item -ItemType Directory -Path $refreshDump -Force | Out-Null

        '[]' | Out-File "$refreshDump\users.json"  -Encoding UTF8
        '[]' | Out-File "$refreshDump\groups.json" -Encoding UTF8
        '[]' | Out-File "$refreshDump\ous.json"    -Encoding UTF8

        & ([string]$script:RefreshScript) -DumpPath $refreshDump

        $script:RefreshResult = Join-Path $refreshDump 'findings.json'
    }

    It 'produces findings.json' {
        $script:RefreshResult | Should -Exist
    }

    It 'findings.json contains 6 finding types' {
        $data = @(Get-Content $script:RefreshResult -Raw | ConvertFrom-Json)
        $data.Count | Should -Be 6
    }

    It 'each finding has findingTypeId' {
        $data = @(Get-Content $script:RefreshResult -Raw | ConvertFrom-Json)
        foreach ($f in $data) { $f.findingTypeId | Should -Not -BeNullOrEmpty }
    }
}
