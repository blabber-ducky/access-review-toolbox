/* ── table-renderer.js — generic sortable/filterable/paginated table ──────── */
(function () {
  'use strict';

  var PAGE_SIZE = 100;

  /*
   * renderTable(containerId, data, columnDefs, options)
   *
   * columnDefs: [{ key, label, sortable, formatter(value, row) }]
   * options:    { searchable, pageSize }
   */
  function renderTable(containerId, data, columnDefs, options) {
    var container = document.getElementById(containerId);
    if (!container) return;

    options   = options   || {};
    var searchable = options.searchable !== false;
    var pageSize   = options.pageSize   || PAGE_SIZE;

    var state = {
      data:        data || [],
      filtered:    data || [],
      sortKey:     null,
      sortDir:     'asc',
      page:        0,
      searchQuery: ''
    };

    // ── Build DOM ──────────────────────────────────────────────────────────
    container.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'table-toolbar';

    var searchEl, countEl;
    if (searchable) {
      searchEl = document.createElement('input');
      searchEl.className   = 'table-search';
      searchEl.type        = 'text';
      searchEl.placeholder = 'Search...';
      searchEl.addEventListener('input', function () {
        state.searchQuery = this.value.toLowerCase();
        state.page = 0;
        _applyFilter(state, columnDefs);
        _renderBody(tableEl, state, columnDefs, pageSize);
        _renderPagination(paginationEl, state, pageSize, tableEl, columnDefs);
        if (countEl) countEl.textContent = state.filtered.length + ' of ' + state.data.length + ' records';
      });
      toolbar.appendChild(searchEl);
    }

    countEl = document.createElement('span');
    countEl.className   = 'table-count';
    countEl.textContent = (data ? data.length : 0) + ' records';
    toolbar.appendChild(countEl);
    wrap.appendChild(toolbar);

    // Table scroll wrapper
    var scrollWrap = document.createElement('div');
    scrollWrap.className = 'table-scroll';

    var tableEl = document.createElement('table');
    tableEl.className = 'data-table';

    // Head
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    columnDefs.forEach(function (col) {
      var th = document.createElement('th');
      th.dataset.key = col.key;
      if (col.sortable !== false) {
        th.className = 'sortable';
        th.innerHTML = UI.escapeHtml(col.label) + '<span class="sort-icon"></span>';
        th.addEventListener('click', function () {
          if (state.sortKey === col.key) {
            state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          } else {
            state.sortKey = col.key;
            state.sortDir = 'asc';
          }
          state.page = 0;
          _updateSortHeaders(thead, state);
          _applyFilter(state, columnDefs);
          _renderBody(tableEl, state, columnDefs, pageSize);
          _renderPagination(paginationEl, state, pageSize, tableEl, columnDefs);
        });
      } else {
        th.textContent = col.label;
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    // Body placeholder — filled by _renderBody
    tableEl.appendChild(document.createElement('tbody'));

    scrollWrap.appendChild(tableEl);
    wrap.appendChild(scrollWrap);

    // Pagination
    var paginationEl = document.createElement('div');
    paginationEl.className = 'table-pagination';
    wrap.appendChild(paginationEl);

    container.appendChild(wrap);

    // Initial render
    _applyFilter(state, columnDefs);
    _renderBody(tableEl, state, columnDefs, pageSize);
    _renderPagination(paginationEl, state, pageSize, tableEl, columnDefs);
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function _applyFilter(state, columnDefs) {
    var q = state.searchQuery;
    var sorted = _sortData(state.data.slice(), state.sortKey, state.sortDir);
    if (!q) { state.filtered = sorted; return; }
    state.filtered = sorted.filter(function (row) {
      return columnDefs.some(function (col) {
        var val = row[col.key];
        if (val == null) return false;
        return String(val).toLowerCase().indexOf(q) !== -1;
      });
    });
  }

  function _sortData(arr, key, dir) {
    if (!key) return arr;
    return arr.sort(function (a, b) {
      var av = a[key], bv = b[key];
      if (av == null) av = '';
      if (bv == null) bv = '';
      // Numeric sort
      var an = parseFloat(av), bn = parseFloat(bv);
      if (!isNaN(an) && !isNaN(bn)) { return dir === 'asc' ? an - bn : bn - an; }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ?  1 : -1;
      return 0;
    });
  }

  // ── Body rendering ─────────────────────────────────────────────────────────
  function _renderBody(tableEl, state, columnDefs, pageSize) {
    var tbody = tableEl.querySelector('tbody');
    tbody.innerHTML = '';

    var start = state.page * pageSize;
    var slice = pageSize > 0 ? state.filtered.slice(start, start + pageSize) : state.filtered;

    if (slice.length === 0) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = columnDefs.length;
      td.style.textAlign = 'center';
      td.style.padding   = '24px';
      td.style.color     = 'var(--color-text-muted)';
      td.textContent = state.searchQuery ? 'No results match your search.' : 'No records.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    slice.forEach(function (row) {
      var tr = document.createElement('tr');
      columnDefs.forEach(function (col) {
        var td = document.createElement('td');
        var raw = row[col.key];
        if (col.formatter) {
          var result = col.formatter(raw, row);
          if (typeof result === 'string') {
            td.innerHTML = result;
          } else {
            td.textContent = result == null ? '' : String(result);
          }
        } else if (typeof raw === 'boolean') {
          td.textContent = raw ? 'Yes' : 'No';
          td.className   = raw ? 'cell-true' : 'cell-false';
        } else if (raw == null) {
          td.textContent = '—';
          td.style.color = 'var(--color-text-muted)';
        } else if (Array.isArray(raw)) {
          td.textContent = raw.join(', ');
          td.className   = 'wrap';
        } else {
          td.textContent = String(raw);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  function _renderPagination(el, state, pageSize, tableEl, columnDefs) {
    el.innerHTML = '';
    if (pageSize <= 0 || state.filtered.length <= pageSize) return;

    var totalPages = Math.ceil(state.filtered.length / pageSize);

    var btnPrev = document.createElement('button');
    btnPrev.textContent = '← Prev';
    btnPrev.disabled    = state.page === 0;
    btnPrev.addEventListener('click', function () {
      state.page--;
      _renderBody(tableEl, state, columnDefs, pageSize);
      _renderPagination(el, state, pageSize, tableEl, columnDefs);
    });

    var info = document.createElement('span');
    info.className   = 'page-info';
    info.textContent = 'Page ' + (state.page + 1) + ' of ' + totalPages;

    var btnNext = document.createElement('button');
    btnNext.textContent = 'Next →';
    btnNext.disabled    = state.page >= totalPages - 1;
    btnNext.addEventListener('click', function () {
      state.page++;
      _renderBody(tableEl, state, columnDefs, pageSize);
      _renderPagination(el, state, pageSize, tableEl, columnDefs);
    });

    el.appendChild(btnPrev);
    el.appendChild(info);
    el.appendChild(btnNext);
  }

  // ── Sort header state ──────────────────────────────────────────────────────
  function _updateSortHeaders(thead, state) {
    thead.querySelectorAll('th').forEach(function (th) {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.key === state.sortKey) {
        th.classList.add('sort-' + state.sortDir);
      }
    });
  }

  // ── Date helpers (used by modules) ─────────────────────────────────────────
  function daysSince(isoString) {
    if (!isoString) return null;
    var then = new Date(isoString);
    if (isNaN(then)) return null;
    return Math.floor((Date.now() - then.getTime()) / 86400000);
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    var d = new Date(isoString);
    if (isNaN(d)) return isoString;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function formatDateAge(isoString) {
    var days = daysSince(isoString);
    if (days === null) return '—';
    var text = formatDate(isoString);
    return text + ' <span style="color:var(--color-text-muted);font-size:11px">(' + days + 'd ago)</span>';
  }

  window.renderTable  = renderTable;
  window.TableHelpers = { daysSince, formatDate, formatDateAge };
})();
