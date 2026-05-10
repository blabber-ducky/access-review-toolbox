/* ── dump-manager.js — dump enumeration, selection, data loading ─────────── */
(function () {
  'use strict';

  var _currentDump     = null;   // { path, timestampFormatted, status, ... }
  var _currentDumpData = {};     // { tabId: [...records] }
  var _onDumpLoaded    = [];

  function getCurrentDump()     { return _currentDump; }
  function getCurrentDumpData() { return _currentDumpData; }

  function onDumpLoaded(fn) { _onDumpLoaded.push(fn); }

  // ── Fetch list of dumps for the active module ──────────────────────────────
  function refreshDumpList(moduleId) {
    return fetch('/api/dumps?module=' + encodeURIComponent(moduleId))
      .then(function (r) { return r.json(); })
      .then(function (dumps) {
        _renderDumpSelector(dumps, moduleId);
        return dumps;
      });
  }

  function _renderDumpSelector(dumps, moduleId) {
    var sel = document.getElementById('dump-selector');
    sel.innerHTML = '';

    var valid = dumps.filter(function (d) { return d.status === 'complete'; });

    if (valid.length === 0) {
      var opt = document.createElement('option');
      opt.textContent = '-- No dumps available --';
      opt.disabled = true;
      sel.appendChild(opt);
      sel.disabled = true;
      _setDumpInfo('No dump loaded');
      return;
    }

    sel.disabled = false;
    valid.forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = JSON.stringify(d);
      opt.textContent = d.timestampFormatted +
        (d.hostname ? ' (' + d.hostname + ')' : '');
      sel.appendChild(opt);
    });

    // Also add invalid dumps as disabled options
    dumps.filter(function (d) { return d.status !== 'complete'; }).forEach(function (d) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.textContent = d.timestampFormatted + ' [incomplete]';
      sel.appendChild(opt);
    });

    // Auto-select and load the newest valid dump
    sel.selectedIndex = 0;
    var newest = valid[0];
    loadDump(newest, moduleId);
  }

  // ── Load a specific dump ───────────────────────────────────────────────────
  function loadDump(dumpMeta, moduleId) {
    var module = _getModule(moduleId);
    if (!module) return;

    _currentDump     = dumpMeta;
    _currentDumpData = {};

    var dataTabs = module.tabs.filter(function (t) { return t.dataFile; });
    var promises = dataTabs.map(function (tab) {
      var filePath = dumpMeta.path + '\\' + tab.dataFile;
      return fetch('/api/data/abs?path=' + encodeURIComponent(filePath))
        .then(function (r) {
          if (!r.ok) throw new Error('Could not load ' + tab.dataFile);
          return r.json();
        })
        .then(function (data) {
          _currentDumpData[tab.id] = data;
        })
        .catch(function (e) {
          console.warn('Dump file load error:', e.message);
          _currentDumpData[tab.id] = [];
        });
    });

    return Promise.all(promises).then(function () {
      _setDumpInfo(
        dumpMeta.timestampFormatted +
        (dumpMeta.hostname    ? ' — ' + dumpMeta.hostname    : '') +
        (dumpMeta.collectedBy ? ' (' + dumpMeta.collectedBy + ')' : '')
      );
      _onDumpLoaded.forEach(function (fn) { fn(_currentDump, _currentDumpData, moduleId); });
    });
  }

  function _setDumpInfo(text) {
    var el = document.getElementById('dump-info');
    if (el) el.textContent = text;
  }

  // ── Wire the dump selector dropdown ───────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var sel = document.getElementById('dump-selector');
    sel.addEventListener('change', function () {
      if (!this.value) return;
      var meta     = JSON.parse(this.value);
      var moduleId = Router.getActiveModule();
      if (moduleId) loadDump(meta, moduleId);
    });
  });

  // ── Helper: get module from registry ─────────────────────────────────────
  function _getModule(moduleId) {
    return (window.MODULE_REGISTRY || []).find(function (m) { return m.id === moduleId; });
  }

  window.DumpManager = { refreshDumpList, loadDump, getCurrentDump, getCurrentDumpData, onDumpLoaded };
})();
