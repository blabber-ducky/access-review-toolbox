# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- Initial project scaffold: folder structure, .gitignore, module manifests, config template
- Documentation: architecture, dataflow, developer guide, and user guide under `docs/`
- Phase 2: PowerShell HTTP server with static file serving and full REST API (`/api/modules`, `/api/dump`, `/api/dumps`, `/api/dump/status`, `/api/config/load`, `/api/config/save`, `/api/data/abs`)
- Phase 3: Full app shell CSS (main, sidebar, tabs, table, findings, modal) with CSS custom properties design system
- Phase 3: `ui.js` (toast, modal, progress bar helpers) and `router.js` (module/tab state machine)
- Phase 4: `app.js` bootstrap, `config.js` load/save/modal, `dump-manager.js` dump listing and loading, `ps-bridge.js` job polling
- Phase 5: AD PowerShell collector (`scripts/ad/collect.ps1`) — users, computers, groups, OUs with manifest
- Phase 6: Generic `table-renderer.js` (sortable, filterable, paginated) and `js/modules/ad.js` (tab rendering + 6 finding types)
- Phase 7: `findings-engine.js` collapsible card UI with auto-open on findings; `js/modules/fortigate.js` and `js/modules/f5.js` with full evaluate() implementations

### Added (post-phase-7)
- Debug terminal panel (`css/terminal.css`, `js/terminal.js`): slide-up PS console in the UI showing real-time PowerShell output with level-coded colours (progress/done/error/warn/system); toggle via ">_ Console" button; clear button; polls `/api/logs`
- Server log buffer (`$LogBuffer`): all PS job output captured with timestamp, source, and log level; exposed via `GET /api/logs?since=N` and `DELETE /api/logs`
- AD module split: `dump.ps1` (data collection), `review.ps1` (findings analysis → `findings.json`), `refresh.ps1` (re-runs review without re-collecting)
- New server endpoints: `POST /api/review`, `POST /api/refresh` — run named scripts from module manifest `scripts` section
- `module.json` `scripts` field: `{ dump, review, refresh }` — allows per-module script lookup by operation
- Findings engine now loads pre-computed `findings.json` when available; shows "PS analysis" / "Browser analysis" source badge
- Refresh button triggers `POST /api/refresh`, polls for completion, then reloads `findings.json`
- `app.js` auto-runs review script after every successful dump (shows "Running review analysis..." progress)
- `ad.js` exposes `columnDefs` object keyed by finding type ID — used by findings-engine when rendering PS-computed results

### Added (test suite)
- 51 Pester 5 tests: `tests/ps/ad-review.Tests.ps1` (all 6 AD findings, empty-dump, error-exit) and `tests/ps/ad-dump.Tests.ps1` (file schema, manifest, refresh delegation)
- 93 Node.js tests (node:test): `tests/js/ad.test.js`, `tests/js/fortigate.test.js`, `tests/js/f5.test.js`, `tests/js/table-renderer.test.js` — cover evaluate() logic for all 3 modules and all date helper functions
- Test runners: `tests/ps/Run-Tests.ps1` (Pester) and `tests/js/run-tests.js` (Node.js)

### Fixed
- `js/modules/f5.js`: `pools-no-policy` finding now correctly cross-matches `/Common/pool-x` policy references against bare `pool-x` pool names (and vice versa) by normalising both sides of the lookup
