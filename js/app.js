/* ── app.js — bootstrap: registry, sidebar, tab wiring ─────────────────── */
(function () {
  'use strict';

  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];

  document.addEventListener('DOMContentLoaded', function () {
    _init();
  });

  function _init() {
    fetch('/api/modules')
      .then(function (r) { return r.json(); })
      .then(function (manifests) {
        manifests.forEach(function (manifest) {
          var existing = MODULE_REGISTRY.find(function (m) { return m.id === manifest.id; });
          if (existing) {
            Object.keys(manifest).forEach(function (k) {
              if (existing[k] === undefined) existing[k] = manifest[k];
            });
            existing.tabs         = manifest.tabs;
            existing.findingTypes = manifest.findingTypes;
            existing.scripts      = manifest.scripts;
          }
        });

        _buildSidebar();
        _wireTopBar();
        _wireTabs();

        Config.tryRestoreLastConfig().catch(function () {});

        if (MODULE_REGISTRY.length > 0) {
          Router.setActiveModule(MODULE_REGISTRY[0].id);
        }
      })
      .catch(function (e) {
        UI.toast('Failed to load modules: ' + e.message, 'error');
      });
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  var MODULE_ICONS = { ad: '🖥', fortigate: '🔥', f5: '⚖' };

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
      btn.addEventListener('click', function () { Router.setActiveModule(mod.id); });
      nav.appendChild(btn);
    });
  }

  // ── Top bar ────────────────────────────────────────────────────────────────
  function _wireTopBar() {
    var btnCreate = document.getElementById('btn-create-dump');
    btnCreate.addEventListener('click', function () {
      var moduleId = Router.getActiveModule();
      if (!moduleId) return;

      var configPath = Config.getConfigPath();
      var mod        = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });

      if (mod && mod.configKeys && mod.configKeys.length > 0 && !configPath) {
        UI.toast('Please load a config file before creating a dump', 'warn');
        return;
      }

      btnCreate.disabled    = true;
      btnCreate.textContent = 'Collecting...';
      Terminal.appendSystemLine('Starting dump for module: ' + moduleId);

      PSBridge.startDump(moduleId, configPath || '')
        .then(function (dumpPath) {
          UI.toast('Dump complete — running review analysis...', 'info');
          Terminal.appendSystemLine('Dump complete. Starting review...');
          return _runReview(moduleId, dumpPath, configPath || '');
        })
        .then(function () {
          UI.toast('Dump and review complete', 'success');
          DumpManager.refreshDumpList(moduleId);
        })
        .catch(function (e) {
          UI.toast('Error: ' + e.message, 'error');
          // Still try to refresh dump list even if review failed
          var mod2 = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });
          if (mod2) DumpManager.refreshDumpList(moduleId);
        })
        .finally(function () {
          btnCreate.disabled    = false;
          btnCreate.textContent = 'Create Dump';
        });
    });
  }

  // ── Run review script after dump ───────────────────────────────────────────
  function _runReview(moduleId, dumpPath, configPath) {
    var mod = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });
    // Only run if the module has a review script defined
    if (!mod || !mod.scripts || !mod.scripts.review) {
      return Promise.resolve();
    }

    UI.showProgress(0, 'Running review analysis...');
    return fetch('/api/review', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ module: moduleId, dumpPath: dumpPath, configPath: configPath })
    })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.status !== 'started') throw new Error(res.error || 'Review failed to start');
      return _pollJob(res.jobId, 'Review');
    })
    .finally(function () { UI.hideProgress(); });
  }

  function _pollJob(jobId, label) {
    return new Promise(function (resolve, reject) {
      var timer = setInterval(function () {
        fetch('/api/dump/status?jobId=' + encodeURIComponent(jobId))
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.progress) UI.showProgress(res.progress, (label || '') + ': ' + (res.message || ''));
            if (res.status === 'done')  { clearInterval(timer); resolve(res.dumpPath); }
            if (res.status === 'error') { clearInterval(timer); reject(new Error(res.message)); }
          })
          .catch(function (e) { clearInterval(timer); reject(e); });
      }, 1500);
    });
  }

  // ── Tab wiring ─────────────────────────────────────────────────────────────
  function _wireTabs() {
    Router.onModuleChange(function (moduleId) {
      var mod = MODULE_REGISTRY.find(function (m) { return m.id === moduleId; });
      if (!mod) return;

      Router.updateSidebarActive(moduleId);
      document.getElementById('btn-create-dump').disabled = false;

      Router.renderTabBar(mod.tabs, mod.tabs[0].id);

      var panelsEl = document.getElementById('tab-panels');
      panelsEl.innerHTML = '';
      mod.tabs.forEach(function (tab) {
        var panel = document.createElement('div');
        panel.id        = 'panel-' + tab.id;
        panel.className = 'tab-panel';
        panelsEl.appendChild(panel);
      });

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
      } else if (mod.renderTab) {
        mod.renderTab(tabId, dumpData, 'panel-' + tabId);
      }
    });

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
