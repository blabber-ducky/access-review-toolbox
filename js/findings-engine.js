/* ── findings-engine.js — runs module evaluate() and renders findings cards ─ */
(function () {
  'use strict';

  // ── Public: render findings for the active module ──────────────────────────
  function render(moduleId, dumpData) {
    var panelId   = 'panel-findings';
    var container = document.getElementById(panelId);
    if (!container) return;

    var mod = (window.MODULE_REGISTRY || []).find(function (m) { return m.id === moduleId; });
    if (!mod || !mod.evaluate) {
      container.innerHTML = '<div class="empty-state"><p>No findings engine for this module.</p></div>';
      return;
    }

    var hasData = Object.keys(dumpData).some(function (k) {
      return dumpData[k] && dumpData[k].length > 0;
    });
    if (!hasData) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<p>No dump loaded</p>' +
          '<span>Create a dump first, then return to Findings.</span>' +
        '</div>';
      return;
    }

    var dump = DumpManager.getCurrentDump();
    // Try to load pre-computed findings.json from the dump folder first
    if (dump && dump.path) {
      var findingsPath = dump.path + '\\findings.json';
      fetch('/api/data/abs?path=' + encodeURIComponent(findingsPath))
        .then(function (r) {
          if (!r.ok) throw new Error('no findings.json');
          return r.json();
        })
        .then(function (precomputed) {
          // Merge with module's column definitions (by findingTypeId)
          var results = precomputed.map(function (f) {
            var colDefs = mod.columnDefs && mod.columnDefs[f.findingTypeId];
            return Object.assign({}, f, { columns: colDefs || null });
          });
          _renderResults(container, results, moduleId, dumpData, mod, dump);
        })
        .catch(function () {
          // Fall back to in-browser computation
          var results = mod.evaluate(dumpData);
          _renderResults(container, results, moduleId, dumpData, mod, dump);
        });
    } else {
      var results = mod.evaluate(dumpData);
      _renderResults(container, results, moduleId, dumpData, mod, dump);
    }
  }

  // ── Internal: render the findings panel ────────────────────────────────────
  function _renderResults(container, results, moduleId, dumpData, mod, dump) {
    container.innerHTML = '';

    var panel = document.createElement('div');
    panel.className = 'findings-panel';

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'findings-toolbar';

    var h2 = document.createElement('h2');
    h2.textContent = 'Findings';
    toolbar.appendChild(h2);

    // Source badge: PS or JS
    var sourceBadge = document.createElement('span');
    var isPrecomputed = results.length > 0 && results[0].generatedAt;
    sourceBadge.className   = 'badge ' + (isPrecomputed ? 'badge-info' : 'badge-low');
    sourceBadge.title       = isPrecomputed
      ? 'Results loaded from PowerShell-generated findings.json'
      : 'Results computed in browser from dump data';
    sourceBadge.textContent = isPrecomputed ? 'PS analysis' : 'Browser analysis';
    toolbar.appendChild(sourceBadge);

    var btnRefresh = document.createElement('button');
    btnRefresh.id        = 'btn-refresh-findings';
    btnRefresh.innerHTML = '↻ Refresh';
    btnRefresh.addEventListener('click', function () {
      _doRefresh(container, moduleId, dumpData, mod, dump, btnRefresh);
    });
    toolbar.appendChild(btnRefresh);
    panel.appendChild(toolbar);

    // Dump info strip
    if (dump) {
      var info = document.createElement('div');
      info.className   = 'findings-dump-info';
      var genAt = results.length > 0 && results[0].generatedAt
        ? ' · Analysed ' + new Date(results[0].generatedAt).toLocaleString()
        : '';
      info.textContent = 'Snapshot: ' + dump.timestampFormatted +
        (dump.hostname    ? ' — ' + dump.hostname    : '') +
        (dump.collectedBy ? ' (' + dump.collectedBy + ')' : '') + genAt;
      panel.appendChild(info);
    }

    // Finding cards
    results.forEach(function (result, idx) {
      var card = _buildCard(result, idx);
      panel.appendChild(card);
    });

    container.appendChild(panel);
  }

  // ── Refresh via PS API, fallback to in-browser ─────────────────────────────
  function _doRefresh(container, moduleId, dumpData, mod, dump, btnRefresh) {
    if (!dump || !dump.path) {
      // No PS refresh possible, re-run in browser
      var results = mod.evaluate(dumpData);
      _renderResults(container, results, moduleId, dumpData, mod, dump);
      return;
    }

    btnRefresh.disabled     = true;
    btnRefresh.textContent  = '↻ Refreshing...';
    UI.showProgress(0, 'Running refresh analysis...');
    Terminal.appendSystemLine('Refresh triggered for ' + moduleId);

    var configPath = Config.getConfigPath() || '';
    fetch('/api/refresh', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ module: moduleId, dumpPath: dump.path, configPath: configPath })
    })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (res.status !== 'started') throw new Error(res.error || 'Failed to start refresh');
      return _pollJob(res.jobId);
    })
    .then(function () {
      // Reload findings.json
      var findingsPath = dump.path + '\\findings.json';
      return fetch('/api/data/abs?path=' + encodeURIComponent(findingsPath))
        .then(function (r) { return r.json(); })
        .then(function (precomputed) {
          var results = precomputed.map(function (f) {
            var colDefs = mod.columnDefs && mod.columnDefs[f.findingTypeId];
            return Object.assign({}, f, { columns: colDefs || null });
          });
          _renderResults(container, results, moduleId, dumpData, mod, dump);
          UI.toast('Findings refreshed', 'success');
        });
    })
    .catch(function (e) {
      UI.toast('Refresh failed: ' + e.message + ' — falling back to browser analysis', 'warn');
      var results = mod.evaluate(dumpData);
      _renderResults(container, results, moduleId, dumpData, mod, dump);
    })
    .finally(function () {
      btnRefresh.disabled    = false;
      btnRefresh.textContent = '↻ Refresh';
      UI.hideProgress();
    });
  }

  function _pollJob(jobId) {
    return new Promise(function (resolve, reject) {
      var timer = setInterval(function () {
        fetch('/api/dump/status?jobId=' + encodeURIComponent(jobId))
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res.status === 'done')  { clearInterval(timer); resolve(); }
            if (res.status === 'error') { clearInterval(timer); reject(new Error(res.message)); }
            if (res.progress) UI.showProgress(res.progress, res.message);
          })
          .catch(function (e) { clearInterval(timer); reject(e); });
      }, 1500);
    });
  }

  // ── Build a single finding card ────────────────────────────────────────────
  function _buildCard(result, idx) {
    var card = document.createElement('div');
    card.className = 'finding-card finding-' + result.severity;

    var header = document.createElement('div');
    header.className = 'finding-card-header';

    var label = document.createElement('span');
    label.className   = 'finding-label';
    label.textContent = result.label;

    var badge = document.createElement('span');
    badge.className   = 'finding-count-badge' + (result.count === 0 ? ' zero' : '');
    badge.textContent = result.count;

    var chevron = document.createElement('span');
    chevron.className   = 'finding-chevron';
    chevron.textContent = '▶';

    header.appendChild(label);
    header.appendChild(badge);
    header.appendChild(chevron);

    var body = document.createElement('div');
    body.className = 'finding-card-body';

    if (result.note) {
      var note = document.createElement('div');
      note.className   = 'finding-note';
      note.textContent = '⚠ ' + result.note;
      body.appendChild(note);
    }

    if (result.items && result.items.length > 0 && result.columns) {
      var tableWrap = document.createElement('div');
      tableWrap.id = 'finding-table-' + idx;
      body.appendChild(tableWrap);
      renderTable('finding-table-' + idx, result.items, result.columns, { searchable: true, pageSize: 50 });
    } else if (result.count === 0) {
      var clear = document.createElement('div');
      clear.className   = 'findings-all-clear';
      clear.textContent = '✓ No issues found';
      body.appendChild(clear);
    }

    card.appendChild(header);
    card.appendChild(body);

    header.addEventListener('click', function () { card.classList.toggle('open'); });
    if (result.count > 0) card.classList.add('open');

    return card;
  }

  window.FindingsEngine = { render: render };
})();
