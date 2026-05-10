/* ── router.js — module selection + tab switching state ─────────────────── */
(function () {
  'use strict';

  var _activeModuleId = null;
  var _activeTabId    = null;
  var _onModuleChange = [];
  var _onTabChange    = [];

  function setActiveModule(moduleId) {
    if (_activeModuleId === moduleId) return;
    _activeModuleId = moduleId;
    _activeTabId    = null;
    _onModuleChange.forEach(function (fn) { fn(moduleId); });
  }

  function setActiveTab(tabId) {
    if (_activeTabId === tabId) return;
    _activeTabId = tabId;
    _onTabChange.forEach(function (fn) { fn(tabId); });
  }

  function getActiveModule() { return _activeModuleId; }
  function getActiveTab()    { return _activeTabId; }

  function onModuleChange(fn) { _onModuleChange.push(fn); }
  function onTabChange(fn)    { _onTabChange.push(fn); }

  // ── Tab bar rendering ──────────────────────────────────────────────────────
  function renderTabBar(tabs, activeTabId) {
    var bar = document.getElementById('tab-bar');
    bar.innerHTML = '';
    tabs.forEach(function (tab) {
      var btn = document.createElement('button');
      btn.className   = 'tab-btn' + (tab.id === activeTabId ? ' active' : '');
      btn.textContent = tab.label;
      btn.dataset.tabId = tab.id;
      btn.addEventListener('click', function () { setActiveTab(tab.id); });
      bar.appendChild(btn);
    });
  }

  function updateTabBarActive(tabId) {
    var btns = document.querySelectorAll('#tab-bar .tab-btn');
    btns.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tabId === tabId);
    });
  }

  // ── Panel switching ────────────────────────────────────────────────────────
  function showPanel(panelId) {
    document.querySelectorAll('#tab-panels .tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === panelId);
    });
  }

  // ── Sidebar active state ───────────────────────────────────────────────────
  function updateSidebarActive(moduleId) {
    document.querySelectorAll('.module-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.moduleId === moduleId);
    });
  }

  window.Router = {
    setActiveModule, setActiveTab,
    getActiveModule, getActiveTab,
    onModuleChange, onTabChange,
    renderTabBar, updateTabBarActive,
    showPanel, updateSidebarActive
  };
})();
