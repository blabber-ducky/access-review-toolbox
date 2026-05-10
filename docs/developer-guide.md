# Developer Guide

## Prerequisites

- Windows 10/11 or Windows Server 2016+
- PowerShell 5.1 or later (built into all supported Windows versions)
- A modern browser (Chrome, Edge, Firefox)
- For AD collection: the `ActiveDirectory` PowerShell module (available on domain-joined machines or via RSAT)

No package manager, compiler, or Node.js installation is required.

---

## Running the Application Locally

1. Clone or copy the project folder to your machine.
2. Double-click `Launch.bat` (or right-click → Run with PowerShell if UAC prompts appear).
3. The PowerShell server starts and opens `http://localhost:8743/` in your default browser.
4. To stop the server, close the PowerShell window or press `Ctrl+C` in it.

To start the server manually from a PowerShell prompt:

```powershell
powershell.exe -ExecutionPolicy Bypass -NoProfile -File scripts\server.ps1
```

---

## Codebase Orientation

### JS load order (`index.html`)

Files are loaded via explicit `<script>` tags in this order:

```
ui.js              → toast, spinner, modal helpers (no deps)
router.js          → tab/module state (no deps)
config.js          → config API calls (depends on ui.js)
dump-manager.js    → dump enumeration/selection (depends on router.js)
ps-bridge.js       → job posting and polling (depends on ui.js)
table-renderer.js  → generic table builder (no deps)
findings-engine.js → findings runner (depends on table-renderer.js)

js/modules/ad.js         → register() must run before app.js
js/modules/fortigate.js
js/modules/f5.js

app.js             → bootstrap; must be last
```

All JS runs in the global scope — there are no ES module imports. Shared state is on `window` (e.g., `window.MODULE_REGISTRY`).

### CSS variables

Global design tokens are defined in `css/main.css`:

```css
:root {
  --color-primary: #1a73e8;
  --color-danger:  #d93025;
  --color-warn:    #f29900;
  --color-ok:      #188038;
  --color-surface: #ffffff;
  --color-bg:      #f8f9fa;
  --color-border:  #dadce0;
  --sidebar-width: 220px;
  --topbar-height: 52px;
}
```

All colours in module-specific CSS must reference these variables, not hardcoded hex values.

---

## Adding a New Module

Adding a new platform requires exactly three files. No core files need to change.

### Step 1 — Module manifest

Create `modules/{id}/module.json`:

```json
{
  "id":         "newplatform",
  "label":      "New Platform",
  "dumpFolder": "NewPlatform",
  "scriptPath": "scripts/newplatform/collect.ps1",
  "tabs": [
    { "id": "data",     "label": "Data",     "dataFile": "data.json" },
    { "id": "findings", "label": "Findings", "dataFile": null }
  ],
  "findingTypes": [
    { "id": "finding-one", "label": "Human-readable label", "severity": "high" }
  ],
  "configKeys": ["newplatform.host", "newplatform.apiToken"]
}
```

`configKeys` lists the dot-notation paths in `config.json` that this module requires. The UI will warn the user if these are missing when they try to create a dump. Use `[]` if the module uses implicit credentials (like AD).

Valid `severity` values: `"high"`, `"medium"`, `"low"`, `"info"`.

### Step 2 — JavaScript module

Create `js/modules/newplatform.js`:

```javascript
(function () {
  function register(manifest) {
    // Called once at startup. Store manifest if needed.
  }

  function renderTab(tabId, dumpData, containerId) {
    // Called when the user clicks a tab.
    // tabId matches a tab "id" from module.json.
    // dumpData is an object keyed by tab id, e.g. dumpData.data
    // containerId is the id of the <div> to render into.

    if (tabId === 'data') {
      window.renderTable(containerId, dumpData.data, [
        { key: 'name',   label: 'Name',   sortable: true },
        { key: 'status', label: 'Status', sortable: true }
      ]);
    }
  }

  function evaluate(dumpData, findingTypes) {
    // Called by the findings engine.
    // Must return an array of FindingResult objects synchronously.
    const results = [];

    const findingOne = findingTypes.find(f => f.id === 'finding-one');
    if (findingOne) {
      const items = dumpData.data.filter(record => record.status === 'bad');
      results.push({
        findingTypeId: 'finding-one',
        label:         findingOne.label,
        severity:      findingOne.severity,
        count:         items.length,
        items:         items
      });
    }

    return results;
  }

  // Self-register into the global registry
  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];
  window.MODULE_REGISTRY.push({ id: 'newplatform', register, renderTab, evaluate });
})();
```

Then add a `<script>` tag in `index.html` before `app.js`:

```html
<script src="js/modules/newplatform.js"></script>
```

### Step 3 — PowerShell collector

Create `scripts/newplatform/collect.ps1`:

```powershell
param(
  [string]$DumpPath,
  [string]$ConfigPath
)

$ErrorActionPreference = 'Stop'

try {
  $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json

  # --- Collect data ---
  Write-Host "PROGRESS:20:Connecting to New Platform..."
  # ... API calls here ...

  Write-Host "PROGRESS:70:Writing data files..."
  $data | ConvertTo-Json -Depth 10 | Out-File "$DumpPath\data.json" -Encoding UTF8

  # --- Write manifest LAST ---
  Write-Host "PROGRESS:95:Writing manifest..."
  $manifest = @{
    moduleId          = "newplatform"
    moduleLabel       = "New Platform"
    timestamp         = (Get-Date -Format "o")
    timestampFormatted= (Get-Date -Format "yyyy-MM-dd_HH-mm-ss")
    collectedBy       = "$env:USERDOMAIN\$env:USERNAME"
    hostname          = $env:COMPUTERNAME
    files             = @( @{ name = "data.json"; recordCount = $data.Count; sizeBytes = (Get-Item "$DumpPath\data.json").Length } )
    durationSeconds   = [int]($stopwatch.Elapsed.TotalSeconds)
    status            = "complete"
    errors            = @()
  }
  $manifest | ConvertTo-Json -Depth 5 | Out-File "$DumpPath\manifest.json" -Encoding UTF8

  Write-Host "DONE:$DumpPath"
}
catch {
  $errManifest = @{ status = "error"; errors = @($_.Exception.Message) }
  $errManifest | ConvertTo-Json | Out-File "$DumpPath\manifest.json" -Encoding UTF8 -Force
  Write-Host "ERROR:$($_.Exception.Message)"
}
```

**Script conventions:**
- Parameters are always `-DumpPath` and `-ConfigPath`.
- Progress lines use the format `PROGRESS:{percent}:{message}` — the PS server parses these.
- The final line on success is `DONE:{absolutePath}`.
- The final line on failure is `ERROR:{message}`.
- `manifest.json` is always written — on success with `status: "complete"`, on failure with `status: "error"`.
- `$ErrorActionPreference = 'Stop'` ensures exceptions are caught rather than silently skipped.

---

## PowerShell Server API Contract

The server at `scripts/server.ps1` implements these endpoints. When modifying the server, preserve these contracts — the browser JS depends on them.

### `POST /api/dump`

Request body:
```json
{ "module": "ad", "configPath": "C:\\Users\\...\\config.json" }
```

Response:
```json
{ "status": "started", "jobId": "ad-1746880200", "dumpPath": "C:\\...\\dumps\\AD\\2026-05-10_14-30-00" }
```

### `GET /api/dump/status?jobId={id}`

Response while running:
```json
{ "status": "running", "progress": 55, "message": "Collecting groups..." }
```

Response on completion:
```json
{ "status": "done", "dumpPath": "C:\\...\\dumps\\AD\\2026-05-10_14-30-00" }
```

Response on error:
```json
{ "status": "error", "message": "Failed to import ActiveDirectory module" }
```

### `GET /api/dumps?module={id}`

Response (sorted newest-first):
```json
[
  {
    "path": "C:\\...\\dumps\\AD\\2026-05-10_14-30-00",
    "timestamp": "2026-05-10T14:30:00",
    "timestampFormatted": "2026-05-10_14-30-00",
    "status": "complete",
    "fileCount": 5
  }
]
```

Dumps without a valid `manifest.json` are included with `"status": "invalid"`.

---

## Config File Schema

`config.json` is a flat JSON file with per-platform sections. Only the sections for platforms the user runs need to be filled in.

```json
{
  "fortigate": {
    "host":      "https://192.168.1.1",
    "apiToken":  "your-api-token",
    "verifySsl": false
  },
  "f5": {
    "host":      "https://192.168.1.2",
    "username":  "admin",
    "password":  "your-password",
    "verifySsl": false
  }
}
```

PowerShell scripts read this file with:
```powershell
$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$token  = $config.fortigate.apiToken
```

The `configKeys` field in `module.json` uses dot-notation to reference these paths (e.g., `"fortigate.apiToken"`). The UI validates their presence before allowing a dump to start.

---

## Findings Engine Contract

`js/findings-engine.js` calls `module.evaluate(dumpData, findingTypes)` and expects a synchronous return value — no Promises.

`dumpData` is an object where each key is a tab `id` from the module manifest and the value is the parsed JSON array from the corresponding dump file:

```javascript
// For the AD module:
dumpData = {
  users:     [ /* array of user objects */ ],
  computers: [ /* array */ ],
  groups:    [ /* array */ ],
  ous:       [ /* array */ ]
}
```

`findingTypes` is the `findingTypes` array from the module manifest, filtered to only the types the user has enabled (all by default).

The return value must be an array of `FindingResult` objects:

```javascript
{
  findingTypeId: String,   // matches a findingTypes[].id from module.json
  label:         String,   // human-readable label for this finding type
  severity:      String,   // "high" | "medium" | "low" | "info"
  count:         Number,   // number of affected items
  items:         Array     // the raw records from dumpData that triggered this finding
}
```

Return one object per finding type, even if `count` is 0 (the UI will show a green "no issues" badge).

---

## Table Renderer API

`js/table-renderer.js` exposes `window.renderTable(containerId, data, columnDefs, options)`.

```javascript
window.renderTable(
  'tab-panel-users',         // id of container element
  dumpData.users,            // array of data objects
  [
    { key: 'SamAccountName', label: 'Username',    sortable: true },
    { key: 'DisplayName',    label: 'Display Name', sortable: true },
    { key: 'Enabled',        label: 'Enabled',      sortable: true,
      formatter: v => v ? 'Yes' : 'No' },
    { key: 'LastLogonDate',  label: 'Last Logon',   sortable: true,
      formatter: v => v ? new Date(v).toLocaleDateString() : 'Never' }
  ],
  {
    searchable: true,   // show a text filter box above the table
    pageSize:   100     // number of rows per page (0 = no pagination)
  }
);
```

`formatter` is an optional function `(value, row) => string` for custom cell rendering.

---

## Commit Conventions

All commits must follow the conventional commit format defined in `CLAUDE.md`:

| Prefix | When to use |
|--------|------------|
| `feat(scope):` | New feature or module |
| `fix(scope):` | Bug fix |
| `refactor(scope):` | Code restructure with no behaviour change |
| `docs:` | Documentation only |
| `ci:` | CI/build configuration |

Example: `feat(ad): add stale account findings evaluation`

Run any available tests before committing. Update `CHANGELOG.md` under `[Unreleased]` and update `Agent_Progress.md` to reflect the completed work.

---

## Known Limitations and Design Notes

**AD DisabledDate proxy** — Active Directory does not natively store the date an account was disabled. The `long-disabled` finding uses `WhenChanged` as a proxy. This means an account that was modified for any reason after being disabled resets the clock. This is documented in the findings UI as a tooltip.

**Fortigate overlapping policy detection** — The implementation uses a Map keyed on `srcaddr+dstaddr+service` for O(n) grouping. Address groups (rather than individual addresses) are compared as strings, so two policies with semantically equivalent but differently-named address groups will not be flagged. True overlap detection requires resolving address group members, which is out of scope for v1.

**F5 pool–policy join** — The join between `pools.json` and `security_policies.json` relies on pool names matching exactly. If a security policy references a pool by full path (e.g., `/Common/mypool`) while `pools.json` records just `mypool`, the join will fail to link them. The collector script must normalize names to a consistent format.

**SSL verification** — Setting `verifySsl: false` in the config disables certificate validation for that platform's API calls. This is expected for internal appliances with self-signed certs but should not be used in production environments where certificates are valid.
