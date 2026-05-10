# Data Flow

This document traces how data moves through the system for each major operation.

---

## 1. Application Startup

```
User double-clicks Launch.bat
        │
        ▼
PowerShell: scripts/server.ps1 starts HttpListener on localhost:8743
        │
        ├── Opens default browser to http://localhost:8743/
        │
        ▼
Browser loads index.html
        │
        ├── Browser loads CSS and JS files (served by PS server)
        │
        ▼
js/app.js runs:
        │
        ├── GET /api/modules
        │       PS server reads modules/*/module.json from disk
        │       Returns JSON array of all module manifests
        │
        ├── For each module manifest:
        │       Calls module.register(manifest) from js/modules/{id}.js
        │       Adds registered module to MODULE_REGISTRY
        │
        ├── Builds sidebar module list from MODULE_REGISTRY
        │
        ├── Reads localStorage for lastConfigPath
        │       If present: GET /api/config/load?path={lastConfigPath}
        │       Updates config status indicator in sidebar
        │
        └── App ready — user can select a module
```

---

## 2. Loading a Config File

```
User clicks "Load Config" → file picker dialog (browser input[type=file])
        │
        ▼
js/config.js sends:
        GET /api/config/load?path=C:\path\to\config.json
        │
        ▼
PS server reads the file from disk
Returns raw JSON content
        │
        ▼
js/config.js:
        ├── Validates that required keys exist for loaded modules
        ├── Stores path in localStorage as lastConfigPath
        └── Updates sidebar config status: "Config loaded: filename.json"
```

---

## 3. Creating a Dump

```
User selects a module → clicks "Create Dump"
        │
        ▼
js/ps-bridge.js sends:
        POST /api/dump
        Body: { "module": "ad", "configPath": "C:\...\config.json" }
        │
        ▼
PS server:
        ├── Generates timestamp: 2026-05-10_14-30-00
        ├── Creates dump folder: dumps/AD/2026-05-10_14-30-00/
        ├── Starts background job: Start-Job -FilePath scripts/ad/collect.ps1
        │       -ArgumentList $dumpPath, $configPath
        ├── Stores job in $jobs hashtable keyed by jobId
        └── Returns: { "status": "started", "jobId": "ad-1746880200" }
        │
        ▼
js/ps-bridge.js polls every 2 seconds:
        GET /api/dump/status?jobId=ad-1746880200
        │
        ▼
        ┌─── status: "running" → update progress bar, continue polling
        │
        └─── status: "done"   → stop polling, trigger dump load
             status: "error"  → stop polling, show error toast
```

### Inside collect.ps1 (AD example)

```
scripts/ad/collect.ps1 -DumpPath $dumpPath -ConfigPath $configPath
        │
        ├── Import-Module ActiveDirectory
        │
        ├── Get-ADUser -Filter * -Properties *
        │       Writes stdout: "PROGRESS:10:Collecting users..."
        │       Serializes to users.json in $dumpPath
        │
        ├── Get-ADComputer -Filter * -Properties *
        │       Writes stdout: "PROGRESS:30:Collecting computers..."
        │       Serializes to computers.json
        │
        ├── Get-ADGroup -Filter * -Properties Members
        │       Writes stdout: "PROGRESS:55:Collecting groups..."
        │       Resolves member DNs to SamAccountNames
        │       Serializes to groups.json
        │
        ├── Get-ADOrganizationalUnit -Filter * -Properties *
        │       Writes stdout: "PROGRESS:75:Collecting OUs..."
        │       Counts child objects per OU → ObjectCount field
        │       Serializes to ous.json
        │
        ├── Writes manifest.json (status: "complete") ← LAST step
        │
        └── Writes stdout: "DONE:C:\...\dumps\AD\2026-05-10_14-30-00"
```

For **Fortigate** and **F5**, the collection steps are API calls instead of AD cmdlets:

```
scripts/fortigate/collect.ps1:
        ├── Reads fortigate.host and fortigate.apiToken from config.json
        ├── Invoke-RestMethod GET /api/v2/monitor/firewall/policy/ (all policies)
        ├── Invoke-RestMethod GET /api/v2/monitor/firewall/policy/select (traffic stats)
        ├── Merges policy metadata with traffic stats
        └── Writes policies.json → manifest.json

scripts/f5/collect.ps1:
        ├── Reads f5.host, f5.username, f5.password from config.json
        ├── POST /mgmt/shared/authn/login → gets auth token
        ├── GET /mgmt/tm/asm/policies → writes security_policies.json
        ├── GET /mgmt/tm/ltm/pool    → writes pools.json
        └── Writes manifest.json
```

---

## 4. Loading a Dump

```
Dump creation completes (or user selects existing dump from dropdown)
        │
        ▼
js/dump-manager.js:
        GET /api/dumps?module=ad
        │
        ▼
PS server scans dumps/AD/*/manifest.json
Returns array sorted newest-first:
[
  { "path": "...", "timestamp": "2026-05-10_14-30-00", "status": "complete", "fileCount": 5 },
  ...
]
        │
        ▼
js/dump-manager.js populates dump selector dropdown
User selects a dump (or newest is auto-selected after creation)
        │
        ▼
For each tab defined in the module manifest:
        GET /api/data?path=dumps/AD/2026-05-10_14-30-00/users.json
        (PS server reads file from disk, returns JSON)
        │
        ▼
js/router.js caches all dump data in memory as dumpData:
        {
          users:     [ ...342 user objects... ],
          computers: [ ...87 computer objects... ],
          groups:    [ ...56 group objects... ],
          ous:       [ ...12 OU objects... ]
        }
        │
        ▼
js/modules/ad.js renders the active tab using table-renderer.js
```

---

## 5. Viewing Findings

```
User clicks "Findings" tab
        │
        ▼
js/findings-engine.js:
        runFindings("ad", dumpData, findingTypes)
        │
        ▼
js/modules/ad.js evaluate(dumpData, findingTypes):
        │
        ├── stale-enabled:
        │       dumpData.users
        │         .filter(u => u.Enabled === true)
        │         .filter(u => daysSince(u.LastLogonDate) >= 90)
        │
        ├── long-disabled:
        │       dumpData.users
        │         .filter(u => u.Enabled === false)
        │         .filter(u => daysSince(u.WhenChanged) >= 180)
        │
        ├── never-expire-acct:
        │       dumpData.users.filter(u => u.AccountExpirationDate === null)
        │
        ├── never-expire-pwd:
        │       dumpData.users.filter(u => u.PasswordNeverExpires === true)
        │
        ├── empty-groups:
        │       dumpData.groups.filter(g => !g.Members || g.Members.length === 0)
        │
        └── empty-ous:
                dumpData.ous.filter(ou => ou.ObjectCount === 0)
        │
        ▼
Returns array of FindingResult objects
        │
        ▼
js/findings-engine.js renders collapsible finding cards:
        ├── Badge with count and severity colour
        ├── Expandable table of affected items (via table-renderer.js)
        └── "Refresh" button at top of panel
```

### Findings Refresh

```
User clicks "Refresh Findings"
        │
        ▼
js/findings-engine.js calls evaluate() again
        │
        ├── Uses dumpData already in memory — NO network calls
        ├── Re-runs all filter logic against the same snapshot
        └── Re-renders all finding cards
```

The findings always reflect the state of the loaded dump snapshot, not the live environment.

---

## 6. Dump Data Schema

### manifest.json

```json
{
  "moduleId":          "ad",
  "moduleLabel":       "Active Directory",
  "timestamp":         "2026-05-10T14:30:00",
  "timestampFormatted":"2026-05-10_14-30-00",
  "collectedBy":       "DOMAIN\\username",
  "hostname":          "WORKSTATION01",
  "files": [
    { "name": "users.json",     "recordCount": 342, "sizeBytes": 184320 },
    { "name": "computers.json", "recordCount": 87,  "sizeBytes": 42100 },
    { "name": "groups.json",    "recordCount": 56,  "sizeBytes": 19200 },
    { "name": "ous.json",       "recordCount": 12,  "sizeBytes": 4800 }
  ],
  "durationSeconds": 47,
  "status": "complete",
  "errors": []
}
```

`status` is `"complete"` only if all files were written successfully. Any other value (or a missing manifest) means the dump is invalid.

### users.json (AD)

Key fields consumed by the findings engine:

| Field | Type | Used by finding |
|-------|------|----------------|
| `SamAccountName` | string | Display |
| `Enabled` | boolean | stale-enabled, long-disabled, never-expire-acct, never-expire-pwd |
| `LastLogonDate` | ISO date string or null | stale-enabled |
| `WhenChanged` | ISO date string | long-disabled (proxy for DisabledDate) |
| `AccountExpirationDate` | ISO date string or null | never-expire-acct |
| `PasswordNeverExpires` | boolean | never-expire-pwd |
| `DisplayName` | string | Display |
| `DistinguishedName` | string | Display |

> **Note:** Active Directory does not natively record the date an account was disabled. `WhenChanged` is used as a proxy. This is noted in the findings UI as a tooltip.

### policies.json (Fortigate)

Key fields:

| Field | Type | Used by finding |
|-------|------|----------------|
| `policyid` | number | Display |
| `name` | string | Display |
| `srcaddr` | string[] | any-any, internet, overlapping |
| `dstaddr` | string[] | any-any, internet, overlapping |
| `service` | string[] | overlapping |
| `action` | string | Display |
| `bytes` | number | no-traffic |
| `status` | string | Display |

### security_policies.json (F5)

Key fields:

| Field | Type | Used by finding |
|-------|------|----------------|
| `name` | string | Display |
| `enforcementMode` | string | learning-mode (`"transparent"` = learning) |
| `complianceScore` | number | not-owasp-10 |
| `virtualServers` | string[] | Display |

### pools.json (F5)

Key fields:

| Field | Type | Used by finding |
|-------|------|----------------|
| `name` | string | pools-no-policy |
| `members` | object[] | Display |
| `monitor` | string | Display |
