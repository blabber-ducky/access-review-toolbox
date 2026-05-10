/* ── app.js — bootstrap: registry, sidebar, tab wiring ─────────────────── */
(function () {
  'use strict';

  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];

  document.addEventListener('DOMContentLoaded', function () {
    _init();
  });

  function _init() {
    // Fetch all module manifests from the server
    fetch('/api/modules')
      .then(function (r) { return r.json(); })
      .then(function (manifests) {
        // Merge server manifests into pre-registered module objects
        manifests.forEach(function (manifest) {
          var existing = MODULE_REGISTRY.find(function (m) { return m.id === manifest.id; });
          if (existing) {
            // Copy manifest fields onto the registered entry
            Object.keys(manifest).forEach(function (k) {
              if (existing[k] === undefined) existing[k] = manifest[k];
            });
            // Overwrite tabs/findingTypes from manifest (authoritative)
            existing.tabs         = manifest.tabs;
            existing.findingTypes = manifest.findingTypes;
          }
        });

        _buildSidebar();
        _wireTopBar();
        _wireTabs();

        // Restore last config
        Config.tryRestoreLastConfig().catch(function () {});

        // If modules exist, auto-select the first
        if (MODULE_REGISTRY.length > 0) {
          Router.setActiveModule(MODULE_REGISTRY[0].id);
        }
      })
      .catch(function (e) {
        UI.toast('Failed to load modules: ' + e.message, 'error');
      });
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  var MODULE_ICONS = {
    ad:        '🖥',
    fortigate: '🔥',
    f5:        '⚖'
  };

  function _buildSidebar() {
    var nav = document.getElementById('module-list');
    nav.innerHTML = '';

    MODULE_REGISTRY.forEach(function (mod) {
      var btn = document.createElement('button');
      btn.className        = 'module-item';
      btn.dataset.moduleId = mod.id;
      btn.innerHTML =
        '<span class="module-icon">' + (MODULE_ICONS[mod.id] || '📋') + '</span>' +
        '<span>' + UI.escapeHtml(mod.label) + '</span>';
      btn.addEventListener('click', function () {
        Router.setActiveModule(mod.id);
      });
      nav.appendChild(btn);
    });
  }

  // ── Top bar wiring ─────────────────────────────────────────────────────────
  function _wireTopBar() {
    var btnCreate = document.getElementById('btn-create-dump');
    btnCreate.addEventListener('click', function () {
      var moduleId = Router.getActiveModule();
      if (!moduleId) return;

      var configPath = Config.getConfigPath();
      var mod        = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });

      // If module needs config keys, ensure config is loaded
      if (mod && mod.configKeys && mod.configKeys.length > 0 && !configPath) {
        UI.toast('Please load a config file before creating a dump', 'warn');
        return;
      }

      btnCreate.disabled = true;
      btnCreate.textContent = 'Collecting...';

      PSBridge.startDump(moduleId, configPath || '')
        .then(function () {
          UI.toast('Dump complete', 'success');
          DumpManager.refreshDumpList(moduleId);
        })
        .catch(function (e) {
          UI.toast('Collection failed: ' + e.message, 'error');
        })
        .finally(function () {
          btnCreate.disabled = false;
          btnCreate.textContent = 'Create Dump';
        });
    });
  }

  // ── Tab wiring via Router events ───────────────────────────────────────────
  function _wireTabs() {
    Router.onModuleChange(function (moduleId) {
      var mod = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });
      if (!mod) return;

      Router.updateSidebarActive(moduleId);
      document.getElementById('btn-create-dump').disabled = false;

      // Render tab bar
      Router.renderTabBar(mod.tabs, mod.tabs[0].id);

      // Build empty panel containers
      var panelsEl = document.getElementById('tab-panels');
      panelsEl.innerHTML = '';
      mod.tabs.forEach(function (tab) {
        var panel = document.createElement('div');
        panel.id        = 'panel-' + tab.id;
        panel.className = 'tab-panel';
        panelsEl.appendChild(panel);
      });

      // Refresh dump list and activate first tab
      DumpManager.refreshDumpList(moduleId).then(function () {
        Router.setActiveTab(mod.tabs[0].id);
      });
    });

    Router.onTabChange(function (tabId) {
      var moduleId = Router.getActiveModule();
      var mod      = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });
      if (!mod) return;

      Router.updateTabBarActive(tabId);
      Router.showPanel('panel-' + tabId);

      var dumpData = DumpManager.getCurrentDumpData();

      if (tabId === 'findings') {
        FindingsEngine.render(moduleId, dumpData);
      } else {
        // Ask the module to render the tab
        var containerId = 'panel-' + tabId;
        if (mod.renderTab) {
          mod.renderTab(tabId, dumpData, containerId);
        }
      }
    });

    // Re-render active tab when a new dump loads
    DumpManager.onDumpLoaded(function (dump, dumpData, moduleId) {
      var tabId = Router.getActiveTab();
      if (!tabId) return;
      var mod = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });
      if (!mod) return;

      if (tabId === 'findings') {
        FindingsEngine.render(moduleId, dumpData);
      } else if (mod.renderTab) {
        mod.renderTab(tabId, dumpData, 'panel-' + tabId);
      }
    });
  }
})();
