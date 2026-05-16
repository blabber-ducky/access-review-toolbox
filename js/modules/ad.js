/* ── modules/ad.js — Active Directory module ────────────────────────────── */
(function () {
  'use strict';

  // ── Column definitions (shared by renderTab and findings-engine) ───────────
  var columnDefs = {
    'stale-enabled': [
      { key: 'SamAccountName', label: 'Username',     sortable: true },
      { key: 'DisplayName',    label: 'Display Name', sortable: true },
      { key: 'LastLogonDate',  label: 'Last Logon',   sortable: true,
        formatter: function (v) {
          var d = TableHelpers.daysSince(v);
          return TableHelpers.formatDate(v) +
            (d !== null ? ' <span style="color:var(--color-danger);font-size:11px">(' + d + 'd)</span>' : '');
        }
      },
      { key: 'Department', label: 'Department', sortable: true }
    ],
    'long-disabled': [
      { key: 'SamAccountName', label: 'Username',      sortable: true },
      { key: 'DisplayName',    label: 'Display Name',  sortable: true },
      { key: 'WhenChanged',    label: 'Last Modified', sortable: true,
        formatter: function (v) { return TableHelpers.formatDateAge(v); } },
      { key: 'Department',     label: 'Department',    sortable: true }
    ],
    'never-expire-acct': [
      { key: 'SamAccountName',  label: 'Username',     sortable: true },
      { key: 'DisplayName',     label: 'Display Name', sortable: true },
      { key: 'PasswordLastSet', label: 'Password Set', sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'Department',      label: 'Department',   sortable: true }
    ],
    'never-expire-pwd': [
      { key: 'SamAccountName',  label: 'Username',     sortable: true },
      { key: 'DisplayName',     label: 'Display Name', sortable: true },
      { key: 'Enabled',         label: 'Enabled',      sortable: true },
      { key: 'PasswordLastSet', label: 'Password Set', sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } }
    ],
    'empty-groups': [
      { key: 'Name',          label: 'Group Name',  sortable: true },
      { key: 'GroupCategory', label: 'Category',    sortable: true },
      { key: 'GroupScope',    label: 'Scope',       sortable: true },
      { key: 'WhenCreated',   label: 'Created',     sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } }
    ],
    'empty-ous': [
      { key: 'Name',            label: 'OU Name',    sortable: true },
      { key: 'Description',     label: 'Description',sortable: true },
      { key: 'WhenCreated',     label: 'Created',    sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'DistinguishedName', label: 'DN',       sortable: false }
    ]
  };

  function register(manifest) {}

  // ── Tab rendering ──────────────────────────────────────────────────────────
  function renderTab(tabId, dumpData, containerId) {
    var data = dumpData[tabId] || [];
    switch (tabId) {
      case 'users':     _renderUsers(containerId, data);     break;
      case 'computers': _renderComputers(containerId, data); break;
      case 'groups':    _renderGroups(containerId, data);    break;
      case 'ous':       _renderOUs(containerId, data);       break;
    }
  }

  function _renderUsers(containerId, data) {
    renderTable(containerId, data, [
      { key: 'SamAccountName',        label: 'Username',       sortable: true },
      { key: 'DisplayName',           label: 'Display Name',   sortable: true },
      { key: 'Enabled',               label: 'Enabled',        sortable: true },
      { key: 'PasswordNeverExpires',  label: 'Pwd Never Exp.', sortable: true },
      { key: 'LastLogonDate',         label: 'Last Logon',     sortable: true,
        formatter: function (v) { return TableHelpers.formatDateAge(v); } },
      { key: 'PasswordLastSet',       label: 'Password Set',   sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'AccountExpirationDate', label: 'Acct Expires',   sortable: true,
        formatter: function (v) { return v ? TableHelpers.formatDate(v) : 'Never'; } },
      { key: 'Department',            label: 'Department',     sortable: true },
      { key: 'Title',                 label: 'Title',          sortable: true },
      { key: 'DistinguishedName',     label: 'DN',             sortable: false }
    ], { searchable: true });
  }

  function _renderComputers(containerId, data) {
    renderTable(containerId, data, [
      { key: 'Name',                   label: 'Name',       sortable: true },
      { key: 'Enabled',                label: 'Enabled',    sortable: true },
      { key: 'OperatingSystem',        label: 'OS',         sortable: true },
      { key: 'OperatingSystemVersion', label: 'Version',    sortable: true },
      { key: 'IPv4Address',            label: 'IP Address', sortable: true },
      { key: 'LastLogonDate',          label: 'Last Logon', sortable: true,
        formatter: function (v) { return TableHelpers.formatDateAge(v); } },
      { key: 'Description',            label: 'Description',sortable: true },
      { key: 'DistinguishedName',      label: 'DN',         sortable: false }
    ], { searchable: true });
  }

  function _renderGroups(containerId, data) {
    renderTable(containerId, data, [
      { key: 'Name',            label: 'Group Name',  sortable: true },
      { key: 'GroupCategory',   label: 'Category',    sortable: true },
      { key: 'GroupScope',      label: 'Scope',       sortable: true },
      { key: 'MemberCount',     label: 'Members',     sortable: true },
      { key: 'Description',     label: 'Description', sortable: true },
      { key: 'WhenCreated',     label: 'Created',     sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'DistinguishedName', label: 'DN',        sortable: false }
    ], { searchable: true });
  }

  function _renderOUs(containerId, data) {
    renderTable(containerId, data, [
      { key: 'Name',            label: 'OU Name',    sortable: true },
      { key: 'ObjectCount',     label: 'Objects',    sortable: true },
      { key: 'Description',     label: 'Description',sortable: true },
      { key: 'WhenCreated',     label: 'Created',    sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'DistinguishedName', label: 'DN',       sortable: false }
    ], { searchable: true });
  }

  // ── Findings evaluation (in-browser fallback) ──────────────────────────────
  function evaluate(dumpData) {
    var users  = dumpData.users  || [];
    var groups = dumpData.groups || [];
    var ous    = dumpData.ous    || [];
    var now    = Date.now();

    function daysSince(iso) {
      if (!iso) return null;
      var d = new Date(iso);
      return isNaN(d) ? null : Math.floor((now - d.getTime()) / 86400000);
    }

    return [
      {
        findingTypeId: 'stale-enabled',
        label:         'Enabled users with no login ≥ 90 days',
        severity:      'high',
        count:         0,
        note:          null,
        items:         users.filter(function (u) {
          return u.Enabled === true && daysSince(u.LastLogonDate) !== null && daysSince(u.LastLogonDate) >= 90;
        }),
        columns: columnDefs['stale-enabled']
      },
      {
        findingTypeId: 'long-disabled',
        label:         'Disabled users ≥ 180 days',
        severity:      'medium',
        note:          'Age is based on WhenChanged (last-modified date), used as a proxy because AD does not record the exact disable date.',
        items:         users.filter(function (u) {
          return u.Enabled === false && daysSince(u.WhenChanged) !== null && daysSince(u.WhenChanged) >= 180;
        }),
        columns: columnDefs['long-disabled']
      },
      {
        findingTypeId: 'never-expire-acct',
        label:         'Accounts set to never expire',
        severity:      'medium',
        note:          null,
        items:         users.filter(function (u) { return u.Enabled && !u.AccountExpirationDate; }),
        columns: columnDefs['never-expire-acct']
      },
      {
        findingTypeId: 'never-expire-pwd',
        label:         'Accounts with password set to never expire',
        severity:      'medium',
        note:          null,
        items:         users.filter(function (u) { return u.PasswordNeverExpires === true; }),
        columns: columnDefs['never-expire-pwd']
      },
      {
        findingTypeId: 'empty-groups',
        label:         'Groups with no members',
        severity:      'low',
        note:          null,
        items:         groups.filter(function (g) { return !g.Members || g.Members.length === 0; }),
        columns: columnDefs['empty-groups']
      },
      {
        findingTypeId: 'empty-ous',
        label:         'OUs with no objects',
        severity:      'low',
        note:          null,
        items:         ous.filter(function (ou) { return ou.ObjectCount === 0; }),
        columns: columnDefs['empty-ous']
      }
    ].map(function (r) {
      r.count = r.items.length;
      return r;
    });
  }

  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];
  window.MODULE_REGISTRY.push({ id: 'ad', register: register, renderTab: renderTab, evaluate: evaluate, columnDefs: columnDefs });
})();
