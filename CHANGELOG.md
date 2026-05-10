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
