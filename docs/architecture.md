# Architecture

## Overview

Access Review Toolbox is a portable, Windows-only desktop application for performing access and security reviews across enterprise platforms. It runs entirely from a single folder with no installation — users double-click `Launch.bat` and interact with the tool through a browser.

The system is split into two runtime layers:

- **Frontend** — plain HTML, CSS, and JavaScript served at `http://localhost:8743/`
- **Backend** — a PowerShell HTTP server that brokers file I/O and spawns data-collection scripts

There is no database, no cloud dependency, and no build step.

---

## System Layers

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (UI Layer)                  │
│                                                          │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────────┐ │
│  │ Sidebar  │  │  Tab Panels │  │   Findings Engine    │ │
│  │ (modules)│  │ (data view) │  │   (pure JS, no I/O) │ │
│  └──────────┘  └────────────┘  └──────────────────────┘ │
│        │               │                  │              │
│        └───────────────┴──────────────────┘              │
│                        │ fetch()                         │
└────────────────────────┼────────────────────────────────┘
                         │ HTTP  localhost:8743
┌────────────────────────┼────────────────────────────────┐
│             PowerShell HTTP Server (server.ps1)          │
│                        │                                 │
│  ┌─────────────────────┼──────────────────────────────┐ │
│  │  /api/modules       │  /api/dump   /api/dumps      │ │
│  │  /api/config/load   │  /api/dump/status            │ │
│  │  /api/config/save   │                              │ │
│  └─────────────────────┼──────────────────────────────┘ │
│                        │ Start-Job                       │
│  ┌─────────────────────▼──────────────────────────────┐ │
│  │            Collector Scripts (collect.ps1)          │ │
│  │   scripts/ad/     scripts/fortigate/   scripts/f5/ │ │
│  └─────────────────────┬──────────────────────────────┘ │
│                        │ writes JSON                     │
└────────────────────────┼────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Local File System                      │
│                                                          │
│  dumps/{MODULE}/{YYYY-MM-DD_HH-mm-ss}/                   │
│    manifest.json  users.json  policies.json  ...         │
│                                                          │
│  config/config.json                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### PowerShell HTTP Server (`scripts/server.ps1`)

The server runs as a `System.Net.HttpListener` on port `8743`. It has two responsibilities:

1. **Static file serving** — serves all project files (HTML, CSS, JS, JSON) from the project root directory with correct MIME types.
2. **API layer** — handles REST-style endpoints that the browser calls via `fetch()`.

The server spawns data-collection scripts as background PowerShell jobs (`Start-Job`) so the browser is not blocked during long-running dumps. Job state is tracked in a hashtable keyed by a generated `jobId`.

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/modules` | Returns array of all `modules/*/module.json` contents |
| `POST` | `/api/dump` | Starts a collection job for a module; returns `jobId` |
| `GET` | `/api/dump/status?jobId=` | Returns job state: `running`, `done`, or `error` |
| `GET` | `/api/dumps?module=` | Lists existing dump folders for a module, newest first |
| `GET` | `/api/config/load?path=` | Reads a config JSON file from disk |
| `POST` | `/api/config/save` | Writes a config JSON file to disk |

### Module System

Each platform is a self-contained module. A module consists of three files:

| File | Purpose |
|------|---------|
| `modules/{id}/module.json` | Declarative manifest: tabs, finding types, required config keys |
| `js/modules/{id}.js` | Browser-side logic: `register()`, `renderTab()`, `evaluate()` |
| `scripts/{id}/collect.ps1` | PowerShell data collector; writes JSON dump files |

The core application (`js/app.js`) loads all modules dynamically by fetching `GET /api/modules`. It never hardcodes platform names. Adding a new module requires only dropping in these three files — no changes to core code.

### Module Registry

`app.js` builds a `MODULE_REGISTRY` array at startup. Each entry is the module manifest merged with the functions registered by the JS module:

```
MODULE_REGISTRY = [
  {
    id: "ad",
    label: "Active Directory",
    tabs: [...],
    findingTypes: [...],
    register:    Function,   // called once at startup
    renderTab:   Function,   // called when a tab is clicked
    evaluate:    Function    // called by the findings engine
  },
  ...
]
```

### Findings Engine (`js/findings-engine.js`)

The findings engine runs entirely in the browser against data already loaded into memory. It calls the active module's `evaluate(dumpData, findingTypes)` function and renders the results. No network calls are made during a findings run or refresh.

`evaluate()` returns an array of `FindingResult` objects:

```javascript
{
  findingTypeId: "stale-enabled",
  label:         "Enabled users with no login ≥ 90 days",
  severity:      "high",   // "high" | "medium" | "low" | "info"
  count:         14,
  items:         [ ...raw records from dump JSON... ]
}
```

### Dump Storage

Every data collection run creates a timestamped folder:

```
dumps/{MODULE_DUMP_FOLDER}/{YYYY-MM-DD_HH-mm-ss}/
```

`manifest.json` is written as the **last** file in the dump process. Its presence with `"status": "complete"` signals that the dump is valid and safe to load. Folders without a valid manifest (e.g., from an interrupted run) are shown greyed out in the UI.

---

## Technology Decisions

### Why a PowerShell HTTP server instead of opening `file://`

Modern browsers block `fetch()` requests when the page is loaded from `file://` (CORS restrictions, no POST support). A lightweight PowerShell `HttpListener` solves this without requiring Node.js, Python, or any external runtime. Every supported Windows machine has .NET available.

### Why findings run in the browser, not in PowerShell

Separating collection (PowerShell) from analysis (JavaScript) means:
- "Refresh Findings" is instant — no re-running scripts, no waiting for network
- The dump JSON is the single source of truth; findings are always re-derivable
- Analysis logic is easy to read, test, and modify without PowerShell knowledge

### Why no ES modules (`type="module"`)

ES module imports are blocked on `file://` origins. Although the PS server avoids this, keeping script loading explicit via ordered `<script>` tags in `index.html` makes the load sequence transparent and avoids any edge cases with module specifier resolution across environments.

### Why no build step or framework

The tool must work by copying a folder to a new Windows machine with no internet access and no package manager. Plain HTML/CSS/JS satisfies this requirement completely.

---

## Security Considerations

- Credentials in `config.json` are read directly by PowerShell scripts — they never transit through the browser.
- `config.json` is gitignored. The repository contains only `config.template.json`.
- The PS server listens on `localhost` only — it is not accessible from the network.
- SSL verification can be disabled per-platform in the config for environments with self-signed certificates. This is intentional for internal appliances.
- AD collection uses the current Windows session credentials via the `ActiveDirectory` PowerShell module — no password is ever stored or transmitted.

---

## Folder Structure

```
access-review-toolbox/
├── Launch.bat                        # Entry point — starts the PS server
├── index.html                        # App shell HTML
├── CHANGELOG.md
├── Agent_Progress.md                 # Live progress tracking during development
│
├── css/
│   ├── main.css                      # Global reset, layout, CSS variables
│   ├── sidebar.css
│   ├── tabs.css
│   ├── table.css
│   ├── findings.css
│   ├── modal.css
│   └── modules/                      # Per-module CSS overrides
│
├── js/
│   ├── app.js                        # Bootstrap: registry, sidebar, config init
│   ├── router.js                     # Tab/module state management
│   ├── config.js                     # Config file read/write via API
│   ├── dump-manager.js               # Dump enumeration and selection
│   ├── ps-bridge.js                  # POST /api/dump + job polling
│   ├── findings-engine.js            # Generic findings runner
│   ├── table-renderer.js             # Sortable/filterable table builder
│   ├── ui.js                         # Toast, spinner, modal helpers
│   └── modules/                      # Per-module browser logic
│
├── modules/
│   ├── ad/module.json
│   ├── fortigate/module.json
│   └── f5/module.json
│
├── scripts/
│   ├── server.ps1                    # PowerShell HTTP server
│   ├── ad/collect.ps1
│   ├── fortigate/collect.ps1
│   └── f5/collect.ps1
│
├── config/
│   └── config.template.json          # Safe-to-commit credentials template
│
└── dumps/                            # Gitignored — created at runtime
    ├── AD/
    ├── Fortigate/
    └── F5/
```
