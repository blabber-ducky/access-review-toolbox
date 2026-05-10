/* ── modules/ad.js — Active Directory module ────────────────────────────── */
(function () {
  'use strict';

  var _manifest = null;

  function register(manifest) {
    _manifest = manifest;
  }

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
      { key: 'SamAccountName',       label: 'Username',        sortable: true },
      { key: 'DisplayName',          label: 'Display Name',    sortable: true },
      { key: 'Enabled',              label: 'Enabled',         sortable: true },
      { key: 'PasswordNeverExpires', label: 'Pwd Never Exp.',  sortable: true },
      { key: 'LastLogonDate',        label: 'Last Logon',      sortable: true,
        formatter: function (v) { return TableHelpers.formatDateAge(v); } },
      { key: 'PasswordLastSet',      label: 'Password Set',    sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'AccountExpirationDate',label: 'Acct Expires',    sortable: true,
        formatter: function (v) { return v ? TableHelpers.formatDate(v) : 'Never'; } },
      { key: 'Department',           label: 'Department',      sortable: true },
      { key: 'Title',                label: 'Title',           sortable: true },
      { key: 'DistinguishedName',    label: 'DN',              sortable: false }
    ], { searchable: true });
  }

  function _renderComputers(containerId, data) {
    renderTable(containerId, data, [
      { key: 'Name',                   label: 'Name',            sortable: true },
      { key: 'Enabled',                label: 'Enabled',         sortable: true },
      { key: 'OperatingSystem',        label: 'OS',              sortable: true },
      { key: 'OperatingSystemVersion', label: 'Version',         sortable: true },
      { key: 'IPv4Address',            label: 'IP Address',      sortable: true },
      { key: 'LastLogonDate',          label: 'Last Logon',      sortable: true,
        formatter: function (v) { return TableHelpers.formatDateAge(v); } },
      { key: 'Description',            label: 'Description',     sortable: true },
      { key: 'DistinguishedName',      label: 'DN',              sortable: false }
    ], { searchable: true });
  }

  function _renderGroups(containerId, data) {
    renderTable(containerId, data, [
      { key: 'Name',           label: 'Group Name',    sortable: true },
      { key: 'GroupCategory',  label: 'Category',      sortable: true },
      { key: 'GroupScope',     label: 'Scope',         sortable: true },
      { key: 'MemberCount',    label: 'Members',       sortable: true },
      { key: 'Description',    label: 'Description',   sortable: true },
      { key: 'WhenCreated',    label: 'Created',       sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'DistinguishedName', label: 'DN',         sortable: false }
    ], { searchable: true });
  }

  function _renderOUs(containerId, data) {
    renderTable(containerId, data, [
      { key: 'Name',            label: 'OU Name',      sortable: true },
      { key: 'ObjectCount',     label: 'Objects',      sortable: true },
      { key: 'Description',     label: 'Description',  sortable: true },
      { key: 'WhenCreated',     label: 'Created',      sortable: true,
        formatter: function (v) { return TableHelpers.formatDate(v); } },
      { key: 'DistinguishedName', label: 'DN',         sortable: false }
    ], { searchable: true });
  }

  // ── Findings evaluation ────────────────────────────────────────────────────
  function evaluate(dumpData) {
    var users   = dumpData.users   || [];
    var groups  = dumpData.groups  || [];
    var ous     = dumpData.ous     || [];
    var now     = Date.now();

    function daysSince(iso) {
      if (!iso) return null;
      var d = new Date(iso);
      if (isNaN(d)) return null;
      return Math.floor((now - d.getTime()) / 86400000);
    }

    var results = [];

    // 1. Enabled users with no login >= 90 days
    var staleEnabled = users.filter(function (u) {
      if (!u.Enabled) return false;
      var days = daysSince(u.LastLogonDate);
      return days !== null && days >= 90;
    });
    results.push({
      findingTypeId: 'stale-enabled',
      label:         'Enabled users with no login ≥ 90 days',
      severity:      'high',
      count:         staleEnabled.length,
      note:          null,
      items:         staleEnabled,
      columns: [
        { key: 'SamAccountName', label: 'Username',    sortable: true },
        { key: 'DisplayName',    label: 'Display Name',sortable: true },
        { key: 'LastLogonDate',  label: 'Last Logon',  sortable: true,
          formatter: function (v) {
            var d = daysSince(v);
            return TableHelpers.formatDate(v) + (d !== null ? ' <span style="color:var(--color-danger);font-size:11px">(' + d + 'd)</span>' : '');
          }
        },
        { key: 'Department',     label: 'Department',  sortable: true }
      ]
    });

    // 2. Disabled users >= 180 days (using WhenChanged as proxy)
    var longDisabled = users.filter(function (u) {
      if (u.Enabled) return false;
      var days = daysSince(u.WhenChanged);
      return days !== null && days >= 180;
    });
    results.push({
      findingTypeId: 'long-disabled',
      label:         'Disabled users ≥ 180 days',
      severity:      'medium',
      count:         longDisabled.length,
      note:          'Age is based on the account\'s last-modified date (WhenChanged), used as a proxy because AD does not record the exact disable date.',
      items:         longDisabled,
      columns: [
        { key: 'SamAccountName', label: 'Username',      sortable: true },
        { key: 'DisplayName',    label: 'Display Name',  sortable: true },
        { key: 'WhenChanged',    label: 'Last Modified', sortable: true,
          formatter: function (v) { return TableHelpers.formatDateAge(v); } },
        { key: 'Department',     label: 'Department',    sortable: true }
      ]
    });

    // 3. Accounts set to never expire (enabled, no expiration date)
    var neverExpireAcct = users.filter(function (u) {
      return u.Enabled && !u.AccountExpirationDate;
    });
    results.push({
      findingTypeId: 'never-expire-acct',
      label:         'Accounts set to never expire',
      severity:      'medium',
      count:         neverExpireAcct.length,
      note:          null,
      items:         neverExpireAcct,
      columns: [
        { key: 'SamAccountName',    label: 'Username',     sortable: true },
        { key: 'DisplayName',       label: 'Display Name', sortable: true },
        { key: 'PasswordLastSet',   label: 'Password Set', sortable: true,
          formatter: function (v) { return TableHelpers.formatDate(v); } },
        { key: 'Department',        label: 'Department',   sortable: true }
      ]
    });

    // 4. Accounts with password never expire
    var neverExpirePwd = users.filter(function (u) {
      return u.PasswordNeverExpires === true;
    });
    results.push({
      findingTypeId: 'never-expire-pwd',
      label:         'Accounts with password set to never expire',
      severity:      'medium',
      count:         neverExpirePwd.length,
      note:          null,
      items:         neverExpirePwd,
      columns: [
        { key: 'SamAccountName',   label: 'Username',     sortable: true },
        { key: 'DisplayName',      label: 'Display Name', sortable: true },
        { key: 'Enabled',          label: 'Enabled',      sortable: true },
        { key: 'PasswordLastSet',  label: 'Password Set', sortable: true,
          formatter: function (v) { return TableHelpers.formatDate(v); } }
      ]
    });

    // 5. Groups with no members
    var emptyGroups = groups.filter(function (g) {
      return !g.Members || g.Members.length === 0;
    });
    results.push({
      findingTypeId: 'empty-groups',
      label:         'Groups with no members',
      severity:      'low',
      count:         emptyGroups.length,
      note:          null,
      items:         emptyGroups,
      columns: [
        { key: 'Name',          label: 'Group Name',  sortable: true },
        { key: 'GroupCategory', label: 'Category',    sortable: true },
        { key: 'GroupScope',    label: 'Scope',       sortable: true },
        { key: 'WhenCreated',   label: 'Created',     sortable: true,
          formatter: function (v) { return TableHelpers.formatDate(v); } }
      ]
    });

    // 6. OUs with no objects
    var emptyOUs = ous.filter(function (ou) {
      return ou.ObjectCount === 0;
    });
    results.push({
      findingTypeId: 'empty-ous',
      label:         'OUs with no objects',
      severity:      'low',
      count:         emptyOUs.length,
      note:          null,
      items:         emptyOUs,
      columns: [
        { key: 'Name',            label: 'OU Name',    sortable: true },
        { key: 'Description',     label: 'Description',sortable: true },
        { key: 'WhenCreated',     label: 'Created',    sortable: true,
          formatter: function (v) { return TableHelpers.formatDate(v); } },
        { key: 'DistinguishedName', label: 'DN',       sortable: false }
      ]
    });

    return results;
  }

  // ── Register into global registry ─────────────────────────────────────────
  window.MODULE_REGISTRY = window.MODULE_REGISTRY || [];
  window.MODULE_REGISTRY.push({ id: 'ad', register: register, renderTab: renderTab, evaluate: evaluate });
})();
