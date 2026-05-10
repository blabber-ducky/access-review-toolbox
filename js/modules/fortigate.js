/* ── modules/fortigate.js — Fortigate Firewall module ───────────────────── */
(function () {
  'use strict';

  function register(manifest) {}

  function renderTab(tabId, dumpData, containerId) {
    var data = dumpData[tabId] || [];
    if (tabId === 'policies') {
      renderTable(containerId, data, [
        { key: 'policyid', label: 'Policy ID', sortable: true },
        { key: 'name',     label: 'Name',      sortable: true },
        { key: 'srcaddr',  label: 'Source',    sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'dstaddr',  label: 'Destination', sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'service',  label: 'Service',   sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'action',   label: 'Action',    sortable: true },
        { key: 'bytes',    label: 'Bytes',     sortable: true,
          formatter: function (v) {
            if (v == null) return '—';
            if (v >= 1073741824) return (v / 1073741824).toFixed(1) + ' GB';
            if (v >= 1048576)    return (v / 1048576).toFixed(1) + ' MB';
            if (v >= 1024)       return (v / 1024).toFixed(1) + ' KB';
            return v + ' B';
          }
        },
        { key: 'status',   label: 'Status',    sortable: true }
      ], { searchable: true });
    }
  }

  function evaluate(dumpData) {
    var policies = dumpData.policies || [];
    var results  = [];

    // 1. Policies with no data transferred
    var noTraffic = policies.filter(function (p) {
      return p.bytes === 0 || p.bytes == null;
    });
    results.push({
      findingTypeId: 'no-traffic',
      label:         'Policies with no data transferred',
      severity:      'medium',
      count:         noTraffic.length,
      note:          null,
      items:         noTraffic,
      columns: [
        { key: 'policyid', label: 'ID',     sortable: true },
        { key: 'name',     label: 'Name',   sortable: true },
        { key: 'srcaddr',  label: 'Source', sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'dstaddr',  label: 'Dest',   sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'action',   label: 'Action', sortable: true }
      ]
    });

    // 2. Potential overlapping policies (same src+dst+service combination)
    var groupMap = {};
    policies.forEach(function (p) {
      var src = (Array.isArray(p.srcaddr) ? p.srcaddr : [p.srcaddr]).sort().join('|');
      var dst = (Array.isArray(p.dstaddr) ? p.dstaddr : [p.dstaddr]).sort().join('|');
      var svc = (Array.isArray(p.service) ? p.service : [p.service]).sort().join('|');
      var key = src + '~' + dst + '~' + svc;
      if (!groupMap[key]) groupMap[key] = [];
      groupMap[key].push(p);
    });
    var overlapping = [];
    Object.keys(groupMap).forEach(function (key) {
      if (groupMap[key].length > 1) {
        groupMap[key].forEach(function (p) { overlapping.push(p); });
      }
    });
    results.push({
      findingTypeId: 'overlapping',
      label:         'Potential overlapping policies',
      severity:      'high',
      count:         overlapping.length,
      note:          'Policies sharing the same source, destination, and service addresses. The lower-priority rule may never be evaluated.',
      items:         overlapping,
      columns: [
        { key: 'policyid', label: 'ID',      sortable: true },
        { key: 'name',     label: 'Name',    sortable: true },
        { key: 'srcaddr',  label: 'Source',  sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'dstaddr',  label: 'Dest',    sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'service',  label: 'Service', sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } }
      ]
    });

    // 3. Policies allowing traffic to internet (dstaddr contains 'all')
    var internet = policies.filter(function (p) {
      var dst = Array.isArray(p.dstaddr) ? p.dstaddr : [p.dstaddr];
      return dst.some(function (d) { return d && d.toLowerCase() === 'all'; });
    });
    results.push({
      findingTypeId: 'internet',
      label:         'Policies allowing traffic to internet',
      severity:      'high',
      count:         internet.length,
      note:          'Policies where the destination is "all". Review scope and justify internet access.',
      items:         internet,
      columns: [
        { key: 'policyid', label: 'ID',     sortable: true },
        { key: 'name',     label: 'Name',   sortable: true },
        { key: 'srcaddr',  label: 'Source', sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'service',  label: 'Service',sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'action',   label: 'Action', sortable: true }
      ]
    });

    // 4. Any-any rules
    var anyAny = policies.filter(function (p) {
      var src = Array.isArray(p.srcaddr) ? p.srcaddr : [p.srcaddr];
      var dst = Array.isArray(p.dstaddr) ? p.dstaddr : [p.dstaddr];
      return src.some(function (s) { return s && s.toLowerCase() === 'all'; }) &&
             dst.some(function (d) { return d && d.toLowerCase() === 'all'; });
    });
    results.push({
      findingTypeId: 'any-any',
      label:         'Policies with any-any rules',
      severity:      'high',
      count:         anyAny.length,
      note:          null,
      items:         anyAny,
      columns: [
        { key: 'policyid', label: 'ID',     sortable: true },
        { key: 'name',     label: 'Name',   sortable: true },
        { key: 'service',  label: 'Service',sortable: true,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } },
        { key: 'action',   label: 'Action', sortable: true }
      ]
    });

    return results;
  }

  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];
  window.MODULE_REGISTRY.push({ id: 'fortigate', register: register, renderTab: renderTab, evaluate: evaluate });
})();
