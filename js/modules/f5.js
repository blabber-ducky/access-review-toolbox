/* ── modules/f5.js — F5 BIG-IP (WAF) module ────────────────────────────── */
(function () {
  'use strict';

  function register(manifest) {}

  function renderTab(tabId, dumpData, containerId) {
    if (tabId === 'security-policies') {
      renderTable(containerId, dumpData['security-policies'] || [], [
        { key: 'name',            label: 'Policy Name',      sortable: true },
        { key: 'enforcementMode', label: 'Mode',             sortable: true },
        { key: 'complianceScore', label: 'OWASP Score',      sortable: true,
          formatter: function (v) {
            if (v == null) return '—';
            var color = v >= 10 ? 'var(--color-ok)' : v >= 7 ? 'var(--color-warn)' : 'var(--color-danger)';
            return '<span style="color:' + color + ';font-weight:600">' + v + '/10</span>';
          }
        },
        { key: 'active',         label: 'Active',            sortable: true },
        { key: 'type',           label: 'Type',              sortable: true },
        { key: 'virtualServers', label: 'Virtual Servers',   sortable: false,
          formatter: function (v) { return Array.isArray(v) ? v.join(', ') : (v || '—'); } }
      ], { searchable: true });
    } else if (tabId === 'pools') {
      renderTable(containerId, dumpData.pools || [], [
        { key: 'name',          label: 'Pool Name',     sortable: true },
        { key: 'monitor',       label: 'Monitor',       sortable: true },
        { key: 'loadBalancing', label: 'LB Method',     sortable: true },
        { key: 'memberCount',   label: 'Members',       sortable: true },
        { key: 'description',   label: 'Description',   sortable: true }
      ], { searchable: true });
    }
  }

  function evaluate(dumpData) {
    var policies = dumpData['security-policies'] || [];
    var pools    = dumpData.pools || [];
    var results  = [];

    // 1. Policies in learning mode (enforcementMode = 'transparent')
    var learningMode = policies.filter(function (p) {
      return p.enforcementMode && p.enforcementMode.toLowerCase() === 'transparent';
    });
    results.push({
      findingTypeId: 'learning-mode',
      label:         'Policies in learning mode',
      severity:      'high',
      count:         learningMode.length,
      note:          'Transparent/learning mode policies do not block attacks. Set to Blocking when ready.',
      items:         learningMode,
      columns: [
        { key: 'name',            label: 'Policy Name', sortable: true },
        { key: 'enforcementMode', label: 'Mode',        sortable: true },
        { key: 'type',            label: 'Type',        sortable: true }
      ]
    });

    // 2. Policies not at OWASP compliance score 10/10
    var notOwasp = policies.filter(function (p) {
      return p.complianceScore != null && p.complianceScore < 10;
    });
    results.push({
      findingTypeId: 'not-owasp-10',
      label:         'Policies not at OWASP compliance score 10/10',
      severity:      'high',
      count:         notOwasp.length,
      note:          null,
      items:         notOwasp,
      columns: [
        { key: 'name',            label: 'Policy Name', sortable: true },
        { key: 'complianceScore', label: 'OWASP Score', sortable: true,
          formatter: function (v) {
            var color = v >= 7 ? 'var(--color-warn)' : 'var(--color-danger)';
            return '<span style="color:' + color + ';font-weight:600">' + v + '/10</span>';
          }
        },
        { key: 'enforcementMode', label: 'Mode',        sortable: true }
      ]
    });

    // 3. Pools with no associated security policy
    var referencedPools = new Set();
    policies.forEach(function (p) {
      var refs = Array.isArray(p.pools) ? p.pools : (p.virtualServers || []);
      refs.forEach(function (r) { referencedPools.add(r); });
    });
    var unprotectedPools = pools.filter(function (pool) {
      // Normalize: strip /Common/ prefix for comparison
      var name = pool.name.replace(/^\/[^/]+\//, '');
      return !referencedPools.has(pool.name) && !referencedPools.has(name);
    });
    results.push({
      findingTypeId: 'pools-no-policy',
      label:         'Pools with no associated security policy',
      severity:      'medium',
      count:         unprotectedPools.length,
      note:          'Pool-to-policy mapping is derived by cross-referencing pool names with security policy references. Verify manually if pool names differ by path prefix.',
      items:         unprotectedPools,
      columns: [
        { key: 'name',        label: 'Pool Name', sortable: true },
        { key: 'memberCount', label: 'Members',   sortable: true },
        { key: 'monitor',     label: 'Monitor',   sortable: true }
      ]
    });

    return results;
  }

  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];
  window.MODULE_REGISTRY.push({ id: 'f5', register: register, renderTab: renderTab, evaluate: evaluate });
})();
