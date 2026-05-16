#Requires -Version 5.1
<#
.SYNOPSIS
    Pester tests for scripts/ad/review.ps1
    Tests findings logic against synthetic dump data — no AD connection required.
#>

BeforeAll {
    $ReviewScript = Resolve-Path "$PSScriptRoot\..\..\scripts\ad\review.ps1"
    $Now          = Get-Date

    # ── Helpers ───────────────────────────────────────────────────────────────
    function DaysAgo([int]$days) { $Now.AddDays(-$days).ToString('o') }

    # ── Build synthetic dump data ─────────────────────────────────────────────
    $script:Users = @(
        # stale-enabled: enabled, last login 95 days ago → should appear in stale-enabled
        @{ SamAccountName='stale.user';     Enabled=$true;  LastLogonDate=(DaysAgo 95);  WhenChanged=(DaysAgo 95);  AccountExpirationDate=(DaysAgo -365); PasswordNeverExpires=$false },
        # long-disabled: disabled, last modified 200 days ago → should appear in long-disabled
        @{ SamAccountName='old.disabled';   Enabled=$false; LastLogonDate=(DaysAgo 300); WhenChanged=(DaysAgo 200); AccountExpirationDate=$null;           PasswordNeverExpires=$false },
        # recent-disabled: disabled, only 30 days ago → should NOT appear in long-disabled
        @{ SamAccountName='new.disabled';   Enabled=$false; LastLogonDate=(DaysAgo 50);  WhenChanged=(DaysAgo 30);  AccountExpirationDate=$null;           PasswordNeverExpires=$false },
        # never-expire-acct: enabled, no expiration date → should appear in never-expire-acct
        @{ SamAccountName='no.expiry';      Enabled=$true;  LastLogonDate=(DaysAgo 5);   WhenChanged=(DaysAgo 5);   AccountExpirationDate=$null;           PasswordNeverExpires=$false },
        # never-expire-pwd: password never expires → should appear in never-expire-pwd
        @{ SamAccountName='pwd.noexpiry';   Enabled=$true;  LastLogonDate=(DaysAgo 2);   WhenChanged=(DaysAgo 2);   AccountExpirationDate=(DaysAgo -365); PasswordNeverExpires=$true  },
        # healthy user: enabled, logged in recently, has expiry, pwd expires → should NOT appear in any user finding
        @{ SamAccountName='healthy.user';   Enabled=$true;  LastLogonDate=(DaysAgo 10);  WhenChanged=(DaysAgo 10);  AccountExpirationDate=(DaysAgo -365); PasswordNeverExpires=$false }
    )

    $script:Groups = @(
        @{ Name='EmptyGroup';    SamAccountName='emptygroup';    MemberCount=0; Members=@() },
        @{ Name='PopulatedGroup';SamAccountName='populatedgroup';MemberCount=3; Members=@('a','b','c') }
    )

    $script:OUs = @(
        @{ Name='EmptyOU';      ObjectCount=0; DistinguishedName='OU=EmptyOU,DC=test,DC=local' },
        @{ Name='PopulatedOU';  ObjectCount=5; DistinguishedName='OU=PopulatedOU,DC=test,DC=local' }
    )
}

Describe 'review.ps1 — AD findings analysis' {

    Context 'With a valid dump containing known issues' {
        BeforeAll {
            # Write synthetic data to a temp dump folder
            $script:DumpPath = Join-Path $TestDrive 'ad-dump-test'
            New-Item -ItemType Directory -Path $script:DumpPath -Force | Out-Null

            $Users  | ConvertTo-Json -Depth 5 -AsArray | Out-File "$($script:DumpPath)\users.json"  -Encoding UTF8
            $Groups | ConvertTo-Json -Depth 5 -AsArray | Out-File "$($script:DumpPath)\groups.json" -Encoding UTF8
            $OUs    | ConvertTo-Json -Depth 5 -AsArray | Out-File "$($script:DumpPath)\ous.json"    -Encoding UTF8

            # Run the script under test
            & $ReviewScript -DumpPath $script:DumpPath

            $script:FindingsFile = Join-Path $script:DumpPath 'findings.json'
            $script:Findings     = Get-Content $script:FindingsFile -Raw | ConvertFrom-Json
        }

        It 'creates findings.json' {
            $script:FindingsFile | Should -Exist
        }

        It 'produces exactly 6 finding types' {
            $script:Findings.Count | Should -Be 6
        }

        It 'every finding has required fields' {
            foreach ($f in $script:Findings) {
                $f.findingTypeId | Should -Not -BeNullOrEmpty
                $f.label         | Should -Not -BeNullOrEmpty
                $f.severity      | Should -BeIn @('high','medium','low','info')
                $f.count         | Should -Not -BeNullOrEmpty
                $f.generatedAt   | Should -Not -BeNullOrEmpty
            }
        }

        It 'count matches items array length for every finding' {
            foreach ($f in $script:Findings) {
                $f.count | Should -Be $f.items.Count
            }
        }

        # ── stale-enabled ───────────────────────────────────────────────────
        Context 'stale-enabled finding' {
            BeforeAll { $script:F = $script:Findings | Where-Object { $_.findingTypeId -eq 'stale-enabled' } }

            It 'exists in findings output' { $script:F | Should -Not -BeNullOrEmpty }
            It 'has severity high'         { $script:F.severity | Should -Be 'high' }
            It 'finds exactly 1 stale enabled user (stale.user)' { $script:F.count | Should -Be 1 }
            It 'correctly identifies stale.user' {
                $script:F.items[0].SamAccountName | Should -Be 'stale.user'
            }
            It 'does not include healthy.user (logged in 10d ago)' {
                $script:F.items.SamAccountName | Should -Not -Contain 'healthy.user'
            }
        }

        # ── long-disabled ───────────────────────────────────────────────────
        Context 'long-disabled finding' {
            BeforeAll { $script:F = $script:Findings | Where-Object { $_.findingTypeId -eq 'long-disabled' } }

            It 'exists in findings output' { $script:F | Should -Not -BeNullOrEmpty }
            It 'has severity medium'       { $script:F.severity | Should -Be 'medium' }
            It 'finds exactly 1 long-disabled account (old.disabled)' { $script:F.count | Should -Be 1 }
            It 'correctly identifies old.disabled' {
                $script:F.items[0].SamAccountName | Should -Be 'old.disabled'
            }
            It 'does not include new.disabled (only 30d ago)' {
                $script:F.items.SamAccountName | Should -Not -Contain 'new.disabled'
            }
        }

        # ── never-expire-acct ───────────────────────────────────────────────
        Context 'never-expire-acct finding' {
            BeforeAll { $script:F = $script:Findings | Where-Object { $_.findingTypeId -eq 'never-expire-acct' } }

            It 'exists in findings output'  { $script:F | Should -Not -BeNullOrEmpty }
            It 'has severity medium'        { $script:F.severity | Should -Be 'medium' }
            It 'finds accounts with null AccountExpirationDate' { $script:F.count | Should -BeGreaterOrEqual 1 }
            It 'includes no.expiry'  {
                $script:F.items.SamAccountName | Should -Contain 'no.expiry'
            }
            It 'does not include disabled accounts' {
                $script:F.items | Where-Object { $_.Enabled -eq $false } | Should -BeNullOrEmpty
            }
        }

        # ── never-expire-pwd ────────────────────────────────────────────────
        Context 'never-expire-pwd finding' {
            BeforeAll { $script:F = $script:Findings | Where-Object { $_.findingTypeId -eq 'never-expire-pwd' } }

            It 'exists in findings output' { $script:F | Should -Not -BeNullOrEmpty }
            It 'has severity medium'       { $script:F.severity | Should -Be 'medium' }
            It 'finds exactly 1 account (pwd.noexpiry)' { $script:F.count | Should -Be 1 }
            It 'correctly identifies pwd.noexpiry' {
                $script:F.items[0].SamAccountName | Should -Be 'pwd.noexpiry'
            }
        }

        # ── empty-groups ────────────────────────────────────────────────────
        Context 'empty-groups finding' {
            BeforeAll { $script:F = $script:Findings | Where-Object { $_.findingTypeId -eq 'empty-groups' } }

            It 'exists in findings output'  { $script:F | Should -Not -BeNullOrEmpty }
            It 'has severity low'           { $script:F.severity | Should -Be 'low' }
            It 'finds exactly 1 empty group' { $script:F.count | Should -Be 1 }
            It 'correctly identifies EmptyGroup' {
                $script:F.items[0].Name | Should -Be 'EmptyGroup'
            }
            It 'does not include PopulatedGroup' {
                $script:F.items.Name | Should -Not -Contain 'PopulatedGroup'
            }
        }

        # ── empty-ous ───────────────────────────────────────────────────────
        Context 'empty-ous finding' {
            BeforeAll { $script:F = $script:Findings | Where-Object { $_.findingTypeId -eq 'empty-ous' } }

            It 'exists in findings output' { $script:F | Should -Not -BeNullOrEmpty }
            It 'has severity low'          { $script:F.severity | Should -Be 'low' }
            It 'finds exactly 1 empty OU'  { $script:F.count | Should -Be 1 }
            It 'correctly identifies EmptyOU' {
                $script:F.items[0].Name | Should -Be 'EmptyOU'
            }
            It 'does not include PopulatedOU' {
                $script:F.items.Name | Should -Not -Contain 'PopulatedOU'
            }
        }
    }

    Context 'With an empty dump (no users, no groups, no OUs)' {
        BeforeAll {
            $emptyDump = Join-Path $TestDrive 'ad-dump-empty'
            New-Item -ItemType Directory -Path $emptyDump -Force | Out-Null
            '[]' | Out-File "$emptyDump\users.json"  -Encoding UTF8
            '[]' | Out-File "$emptyDump\groups.json" -Encoding UTF8
            '[]' | Out-File "$emptyDump\ous.json"    -Encoding UTF8

            & $ReviewScript -DumpPath $emptyDump
            $script:EmptyFindings = Get-Content "$emptyDump\findings.json" -Raw | ConvertFrom-Json
        }

        It 'still produces 6 finding types' { $script:EmptyFindings.Count | Should -Be 6 }

        It 'all finding counts are 0' {
            foreach ($f in $script:EmptyFindings) {
                $f.count | Should -Be 0 -Because "no data means no findings for $($f.findingTypeId)"
            }
        }
    }

    Context 'Missing users.json exits with error' {
        It 'exits non-zero when users.json is absent' {
            $missing = Join-Path $TestDrive 'ad-dump-missing'
            New-Item -ItemType Directory -Path $missing -Force | Out-Null
            # Do not create users.json

            $result = & pwsh -NoProfile -ExecutionPolicy Bypass -File $ReviewScript -DumpPath $missing 2>&1
            $LASTEXITCODE | Should -Be 1
            ($result | Out-String) | Should -Match 'ERROR:'
        }
    }
}
