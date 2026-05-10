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

    // Check if there is any data loaded
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

    var results = mod.evaluate(dumpData);
    _renderResults(container, results, moduleId, dumpData, mod);
  }

  // ── Internal: render the findings panel ────────────────────────────────────
  function _renderResults(container, results, moduleId, dumpData, mod) {
    container.innerHTML = '';

    var panel = document.createElement('div');
    panel.className = 'findings-panel';

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'findings-toolbar';

    var h2 = document.createElement('h2');
    h2.textContent = 'Findings';
    toolbar.appendChild(h2);

    var btnRefresh = document.createElement('button');
    btnRefresh.id        = 'btn-refresh-findings';
    btnRefresh.innerHTML = '↻ Refresh';
    btnRefresh.addEventListener('click', function () {
      var fresh = mod.evaluate(dumpData);
      _renderResults(container, fresh, moduleId, dumpData, mod);
    });
    toolbar.appendChild(btnRefresh);
    panel.appendChild(toolbar);

    // Dump info strip
    var dump = DumpManager.getCurrentDump();
    if (dump) {
      var info = document.createElement('div');
      info.className   = 'findings-dump-info';
      info.textContent = 'Snapshot: ' + dump.timestampFormatted +
        (dump.hostname    ? ' — ' + dump.hostname    : '') +
        (dump.collectedBy ? ' (' + dump.collectedBy + ')' : '');
      panel.appendChild(info);
    }

    // Finding cards
    results.forEach(function (result, idx) {
      var card = _buildCard(result, idx);
      panel.appendChild(card);
    });

    container.appendChild(panel);
  }

  // ── Build a single finding card ────────────────────────────────────────────
  function _buildCard(result, idx) {
    var card = document.createElement('div');
    card.className = 'finding-card finding-' + result.severity;

    // Header (clickable)
    var header = document.createElement('div');
    header.className = 'finding-card-header';

    var label = document.createElement('span');
    label.className   = 'finding-label';
    label.textContent = result.label;

    var badge = document.createElement('span');
    badge.className = 'finding-count-badge' + (result.count === 0 ? ' zero' : '');
    badge.textContent = result.count;

    var chevron = document.createElement('span');
    chevron.className   = 'finding-chevron';
    chevron.textContent = '▶';

    header.appendChild(label);
    header.appendChild(badge);
    header.appendChild(chevron);

    // Body (collapsed by default unless there are findings)
    var body = document.createElement('div');
    body.className = 'finding-card-body';

    // Note (proxy disclaimer etc.)
    if (result.note) {
      var note = document.createElement('div');
      note.className   = 'finding-note';
      note.textContent = '⚠ ' + result.note;
      body.appendChild(note);
    }

    // Table of affected items
    if (result.items && result.items.length > 0 && result.columns) {
      var tableWrap = document.createElement('div');
      tableWrap.id = 'finding-table-' + idx;
      body.appendChild(tableWrap);
      // Render table immediately when card is built (visible after toggle)
      renderTable('finding-table-' + idx, result.items, result.columns, { searchable: true, pageSize: 50 });
    } else if (result.count === 0) {
      var clear = document.createElement('div');
      clear.className   = 'findings-all-clear';
      clear.textContent = '✓ No issues found';
      body.appendChild(clear);
    }

    card.appendChild(header);
    card.appendChild(body);

    // Toggle on header click
    header.addEventListener('click', function () {
      card.classList.toggle('open');
    });

    // Auto-open cards with findings
    if (result.count > 0) {
      card.classList.add('open');
    }

    return card;
  }

  window.FindingsEngine = { render: render };
})();
