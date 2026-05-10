/* ── config.js — config file load/save via API ──────────────────────────── */
(function () {
  'use strict';

  var _configData = null;
  var _configPath = null;

  var STORAGE_KEY = 'artb_lastConfigPath';

  function getConfig()     { return _configData; }
  function getConfigPath() { return _configPath; }

  // Load config from an absolute file path via the PS server
  function loadConfig(absPath) {
    return fetch('/api/config/load?path=' + encodeURIComponent(absPath))
      .then(function (r) {
        if (!r.ok) throw new Error('Config not found at: ' + absPath);
        return r.json();
      })
      .then(function (data) {
        _configData = data;
        _configPath = absPath;
        localStorage.setItem(STORAGE_KEY, absPath);
        _updateStatusUI('loaded', absPath);
        return data;
      });
  }

  // Save config JSON to a file path
  function saveConfig(absPath, data) {
    return fetch('/api/config/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: absPath, data: data })
    })
    .then(function (r) { return r.json(); })
    .then(function () {
      _configData = data;
      _configPath = absPath;
      localStorage.setItem(STORAGE_KEY, absPath);
      _updateStatusUI('loaded', absPath);
    });
  }

  // Try to restore the last-used config on startup
  function tryRestoreLastConfig() {
    var last = localStorage.getItem(STORAGE_KEY);
    if (!last) return Promise.resolve(null);
    return loadConfig(last).catch(function () {
      localStorage.removeItem(STORAGE_KEY);
      _updateStatusUI('error', 'Last config not found');
      return null;
    });
  }

  function _updateStatusUI(state, text) {
    var el = document.getElementById('config-status');
    if (!el) return;
    el.className = 'config-status ' + state;
    var name = text ? text.split(/[\\/]/).pop() : '';
    el.textContent = state === 'loaded' ? ('Config: ' + name) : text;
  }

  // ── Build the "New Config" modal form ──────────────────────────────────────
  function showNewConfigModal() {
    var html =
      '<p class="modal-section-title">Fortigate</p>' +
      '<div class="modal-field"><label>Host URL <span>(e.g. https://192.168.1.1)</span></label>' +
        '<input id="cfg-fg-host" type="text" placeholder="https://192.168.1.1" /></div>' +
      '<div class="modal-field"><label>API Token</label>' +
        '<input id="cfg-fg-token" type="password" placeholder="your-api-token" /></div>' +
      '<div class="modal-field"><label>' +
        '<input id="cfg-fg-ssl" type="checkbox" /> Verify SSL certificate</label></div>' +

      '<p class="modal-section-title">F5 BIG-IP</p>' +
      '<div class="modal-field"><label>Host URL</label>' +
        '<input id="cfg-f5-host" type="text" placeholder="https://192.168.1.2" /></div>' +
      '<div class="modal-field"><label>Username</label>' +
        '<input id="cfg-f5-user" type="text" placeholder="admin" /></div>' +
      '<div class="modal-field"><label>Password</label>' +
        '<input id="cfg-f5-pass" type="password" placeholder="password" /></div>' +
      '<div class="modal-field"><label>' +
        '<input id="cfg-f5-ssl" type="checkbox" /> Verify SSL certificate</label></div>' +

      '<p class="modal-section-title">Save location</p>' +
      '<div class="modal-field"><label>File path</label>' +
        '<input id="cfg-save-path" type="text" placeholder="C:\\Users\\you\\config.json" /></div>';

    UI.showModal('New Config', html, 'Save', function () {
      var data = {
        fortigate: {
          host:      document.getElementById('cfg-fg-host').value.trim(),
          apiToken:  document.getElementById('cfg-fg-token').value,
          verifySsl: document.getElementById('cfg-fg-ssl').checked
        },
        f5: {
          host:      document.getElementById('cfg-f5-host').value.trim(),
          username:  document.getElementById('cfg-f5-user').value.trim(),
          password:  document.getElementById('cfg-f5-pass').value,
          verifySsl: document.getElementById('cfg-f5-ssl').checked
        }
      };
      var savePath = document.getElementById('cfg-save-path').value.trim();
      if (!savePath) { UI.toast('Please enter a file path', 'error'); return; }
      saveConfig(savePath, data)
        .then(function () { UI.toast('Config saved', 'success'); })
        .catch(function (e) { UI.toast('Save failed: ' + e.message, 'error'); });
    });
  }

  // ── "Load Config" — use a hidden file input ────────────────────────────────
  function promptLoadConfig() {
    // The server needs an absolute path; we can't get that from a file input in the browser.
    // Instead, prompt for a path string.
    var html =
      '<div class="modal-field"><label>Absolute path to your config.json</label>' +
        '<input id="cfg-load-path" type="text" placeholder="C:\\Users\\you\\config.json" /></div>';
    UI.showModal('Load Config', html, 'Load', function () {
      var p = document.getElementById('cfg-load-path').value.trim();
      if (!p) return;
      loadConfig(p)
        .then(function () { UI.toast('Config loaded', 'success'); })
        .catch(function (e) { UI.toast('Failed: ' + e.message, 'error'); });
    });
  }

  // Wire buttons
  document.addEventListener('DOMContentLoaded', function () {
    var btnLoad = document.getElementById('btn-load-config');
    var btnNew  = document.getElementById('btn-new-config');
    if (btnLoad) btnLoad.addEventListener('click', promptLoadConfig);
    if (btnNew)  btnNew.addEventListener('click', showNewConfigModal);
  });

  window.Config = { getConfig, getConfigPath, loadConfig, saveConfig, tryRestoreLastConfig };
})();
