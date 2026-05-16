/* ── terminal.js — debug terminal panel showing PS output ────────────────── */
(function () {
  'use strict';

  var _open        = false;
  var _lastIndex   = 0;
  var _pollTimer   = null;
  var _MAX_DOM_LINES = 500;

  // ── Public API ────────────────────────────────────────────────────────────
  function toggle() {
    _open = !_open;
    var panel = document.getElementById('terminal-panel');
    var btn   = document.getElementById('btn-toggle-terminal');
    panel.classList.toggle('open', _open);
    btn.classList.toggle('active', _open);

    if (_open) {
      _startPolling();
    } else {
      _stopPolling();
    }
  }

  function isOpen() { return _open; }

  function appendSystemLine(text) {
    _appendLine({ timestamp: new Date().toISOString(), source: 'system', text: text, level: 'system' });
  }

  // ── Polling ───────────────────────────────────────────────────────────────
  function _startPolling() {
    if (_pollTimer) return;
    _poll();
    _pollTimer = setInterval(_poll, 1500);
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  function _poll() {
    fetch('/api/logs?since=' + _lastIndex)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.lines && data.lines.length > 0) {
          data.lines.forEach(_appendLine);
          _lastIndex = data.total;
        }
        _updateStatus(data.activeJobs || 0);
      })
      .catch(function () {});
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function _appendLine(entry) {
    var output = document.getElementById('terminal-output');
    if (!output) return;

    var wasAtBottom = output.scrollHeight - output.scrollTop <= output.clientHeight + 20;

    // Trim oldest lines if over limit
    while (output.children.length >= _MAX_DOM_LINES) {
      output.removeChild(output.firstChild);
    }

    var line = document.createElement('div');
    line.className = 'term-line level-' + (entry.level || 'info');

    var timeEl = document.createElement('span');
    timeEl.className   = 'term-time';
    timeEl.textContent = _fmtTime(entry.timestamp);

    var srcEl = document.createElement('span');
    srcEl.className   = 'term-src';
    srcEl.textContent = _fmtSource(entry.source);

    var textEl = document.createElement('span');
    textEl.className   = 'term-text';
    textEl.textContent = entry.text;

    line.appendChild(timeEl);
    line.appendChild(srcEl);
    line.appendChild(textEl);
    output.appendChild(line);

    if (wasAtBottom) {
      output.scrollTop = output.scrollHeight;
    }
  }

  function _updateStatus(activeJobs) {
    var el = document.getElementById('terminal-status');
    if (!el) return;
    if (activeJobs > 0) {
      el.className   = 'term-status';
      el.textContent = activeJobs + ' job' + (activeJobs > 1 ? 's' : '') + ' running';
    } else {
      el.className   = 'term-status idle';
      el.textContent = 'idle';
    }
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toTimeString().slice(0, 8);
    } catch (e) { return ''; }
  }

  function _fmtSource(src) {
    if (!src || src === 'system') return '[system]';
    // e.g. "ad-1746880200" → "[ad]"
    var parts = src.split('-');
    return '[' + parts[0] + ']';
  }

  // ── Wire DOM ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('btn-toggle-terminal');
    if (btn) btn.addEventListener('click', toggle);

    var btnClear = document.getElementById('btn-term-clear');
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        fetch('/api/logs', { method: 'DELETE' })
          .then(function () {
            var output = document.getElementById('terminal-output');
            if (output) output.innerHTML = '';
            _lastIndex = 0;
            _appendLine({ timestamp: new Date().toISOString(), source: 'system', text: 'Log cleared.', level: 'system' });
          })
          .catch(function () {});
      });
    }
  });

  window.Terminal = { toggle, isOpen, appendSystemLine };
})();
