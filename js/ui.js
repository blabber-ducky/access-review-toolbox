/* ── ui.js — toast notifications, spinner, modal helpers ─────────────────── */
(function () {
  'use strict';

  // ── Toast ─────────────────────────────────────────────────────────────────
  function toast(message, type, duration) {
    type     = type     || 'info';     // 'info' | 'success' | 'error' | 'warn'
    duration = duration || 4000;

    var container = document.getElementById('toast-container');
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(function () {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, duration);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  var _onConfirm = null;

  function showModal(title, bodyHtml, confirmLabel, onConfirm) {
    document.getElementById('modal-title').textContent  = title;
    document.getElementById('modal-body').innerHTML     = bodyHtml;
    document.getElementById('modal-confirm').textContent = confirmLabel || 'OK';
    document.getElementById('modal-overlay').classList.remove('hidden');
    _onConfirm = onConfirm || null;
  }

  function hideModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
    _onConfirm = null;
  }

  // Wire modal buttons once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('modal-cancel').addEventListener('click', hideModal);
    document.getElementById('modal-confirm').addEventListener('click', function () {
      if (_onConfirm) _onConfirm();
      hideModal();
    });
    // Close on overlay click
    document.getElementById('modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) hideModal();
    });
  });

  // ── Progress bar (dump creation) ──────────────────────────────────────────
  function showProgress(percent, message) {
    var wrap  = document.getElementById('progress-bar-wrap');
    var fill  = document.getElementById('progress-bar-fill');
    var label = document.getElementById('progress-label');
    wrap.classList.add('visible');
    fill.style.width  = Math.min(percent, 100) + '%';
    label.textContent = message || '';
  }

  function hideProgress() {
    var wrap = document.getElementById('progress-bar-wrap');
    wrap.classList.remove('visible');
    document.getElementById('progress-bar-fill').style.width = '0';
    document.getElementById('progress-label').textContent    = '';
  }

  // ── Empty state helper ─────────────────────────────────────────────────────
  function emptyState(containerId, title, subtitle) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="empty-state">' +
        '<p>' + escapeHtml(title) + '</p>' +
        (subtitle ? '<span>' + escapeHtml(subtitle) + '</span>' : '') +
      '</div>';
  }

  // ── HTML escape ───────────────────────────────────────────────────────────
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Expose ────────────────────────────────────────────────────────────────
  window.UI = { toast, showModal, hideModal, showProgress, hideProgress, emptyState, escapeHtml };
})();
