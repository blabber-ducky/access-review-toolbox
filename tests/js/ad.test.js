'use strict';
// Tests for js/modules/ad.js — evaluate() (browser-side findings logic)

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Global stubs required by ad.js ────────────────────────────────────────
global.window = global;
global.window.MODULE_REGISTRY = [];
global.renderTable  = function () {};
global.TableHelpers = {
  daysSince:     function () { return null; },
  formatDate:    function (v) { return v || '—'; },
  formatDateAge: function (v) { return v || '—'; }
};
global.UI = { escapeHtml: function (s) { return s; } };

eval(fs.readFileSync(path.join(__dirname, '../../js/modules/ad.js'), 'utf8'));

const adMod = global.window.MODULE_REGISTRY.find(function (m) { return m.id === 'ad'; });

function isoAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function isoAhead(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

// ── Synthetic dump data ────────────────────────────────────────────────────
var users = [
  // stale-enabled: enabled, last login 95 days ago
  { SamAccountName: 'stale.user',   Enabled: true,  LastLogonDate: isoAgo(95),  WhenChanged: isoAgo(95),  AccountExpirationDate: isoAhead(365), PasswordNeverExpires: false },
  // long-disabled: disabled, WhenChanged 200 days ago
  { SamAccountName: 'old.disabled', Enabled: false, LastLogonDate: isoAgo(300), WhenChanged: isoAgo(200), AccountExpirationDate: null,          PasswordNeverExpires: false },
  // recent-disabled: disabled, but only 30 days ago
  { SamAccountName: 'new.disabled', Enabled: false, LastLogonDate: isoAgo(50),  WhenChanged: isoAgo(30),  AccountExpirationDate: null,          PasswordNeverExpires: false },
  // never-expire-acct: enabled, null expiry
  { SamAccountName: 'no.expiry',    Enabled: true,  LastLogonDate: isoAgo(5),   WhenChanged: isoAgo(5),   AccountExpirationDate: null,          PasswordNeverExpires: false },
  // never-expire-pwd
  { SamAccountName: 'pwd.noexpiry', Enabled: true,  LastLogonDate: isoAgo(2),   WhenChanged: isoAgo(2),   AccountExpirationDate: isoAhead(365), PasswordNeverExpires: true  },
  // healthy: recent login, has expiry, pwd expires
  { SamAccountName: 'healthy.user', Enabled: true,  LastLogonDate: isoAgo(10),  WhenChanged: isoAgo(10),  AccountExpirationDate: isoAhead(365), PasswordNeverExpires: false }
];

var groups = [
  { Name: 'EmptyGroup',     SamAccountName: 'emptygroup',     MemberCount: 0, Members: [] },
  { Name: 'PopulatedGroup', SamAccountName: 'populatedgroup', MemberCount: 3, Members: ['a', 'b', 'c'] }
];

var ous = [
  { Name: 'EmptyOU',     ObjectCount: 0, DistinguishedName: 'OU=EmptyOU,DC=test,DC=local' },
  { Name: 'PopulatedOU', ObjectCount: 5, DistinguishedName: 'OU=PopulatedOU,DC=test,DC=local' }
];

var findings;

describe('ad.js evaluate()', function () {
  before(function () {
    findings = adMod.evaluate({ users: users, groups: groups, ous: ous });
  });

  it('module is registered', function () {
    assert.ok(adMod, 'ad module should be in MODULE_REGISTRY');
  });

  it('returns exactly 6 findings', function () {
    assert.equal(findings.length, 6);
  });

  it('every finding has required fields', function () {
    var validSeverities = ['high', 'medium', 'low', 'info'];
    findings.forEach(function (f) {
      assert.ok(f.findingTypeId, 'findingTypeId missing');
      assert.ok(f.label,        'label missing');
      assert.ok(validSeverities.includes(f.severity), 'invalid severity: ' + f.severity);
      assert.ok(f.items != null, 'items missing');
      assert.equal(f.count, f.items.length, 'count mismatch for ' + f.findingTypeId);
    });
  });

  // ── stale-enabled ───────────────────────────────────────────────────────
  describe('stale-enabled', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'stale-enabled'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity high', function () { assert.equal(f.severity, 'high'); });
    it('finds exactly 1 stale user', function () { assert.equal(f.count, 1); });
    it('identifies stale.user', function () {
      assert.equal(f.items[0].SamAccountName, 'stale.user');
    });
    it('excludes healthy.user (logged in 10d ago)', function () {
      assert.ok(!f.items.some(function (u) { return u.SamAccountName === 'healthy.user'; }));
    });
    it('excludes disabled users', function () {
      assert.ok(f.items.every(function (u) { return u.Enabled === true; }));
    });
  });

  // ── long-disabled ───────────────────────────────────────────────────────
  describe('long-disabled', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'long-disabled'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity medium', function () { assert.equal(f.severity, 'medium'); });
    it('finds exactly 1 long-disabled account', function () { assert.equal(f.count, 1); });
    it('identifies old.disabled', function () {
      assert.equal(f.items[0].SamAccountName, 'old.disabled');
    });
    it('excludes new.disabled (only 30d)', function () {
      assert.ok(!f.items.some(function (u) { return u.SamAccountName === 'new.disabled'; }));
    });
    it('excludes enabled users', function () {
      assert.ok(f.items.every(function (u) { return u.Enabled === false; }));
    });
  });

  // ── never-expire-acct ───────────────────────────────────────────────────
  describe('never-expire-acct', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'never-expire-acct'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity medium', function () { assert.equal(f.severity, 'medium'); });
    it('includes no.expiry', function () {
      assert.ok(f.items.some(function (u) { return u.SamAccountName === 'no.expiry'; }));
    });
    it('excludes disabled accounts', function () {
      assert.ok(f.items.every(function (u) { return u.Enabled === true; }));
    });
    it('excludes accounts with expiration date set', function () {
      assert.ok(f.items.every(function (u) { return !u.AccountExpirationDate; }));
    });
  });

  // ── never-expire-pwd ────────────────────────────────────────────────────
  describe('never-expire-pwd', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'never-expire-pwd'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity medium', function () { assert.equal(f.severity, 'medium'); });
    it('finds exactly 1 account', function () { assert.equal(f.count, 1); });
    it('identifies pwd.noexpiry', function () {
      assert.equal(f.items[0].SamAccountName, 'pwd.noexpiry');
    });
  });

  // ── empty-groups ────────────────────────────────────────────────────────
  describe('empty-groups', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'empty-groups'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity low', function () { assert.equal(f.severity, 'low'); });
    it('finds exactly 1 empty group', function () { assert.equal(f.count, 1); });
    it('identifies EmptyGroup', function () {
      assert.equal(f.items[0].Name, 'EmptyGroup');
    });
    it('excludes PopulatedGroup', function () {
      assert.ok(!f.items.some(function (g) { return g.Name === 'PopulatedGroup'; }));
    });
  });

  // ── empty-ous ───────────────────────────────────────────────────────────
  describe('empty-ous', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'empty-ous'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity low', function () { assert.equal(f.severity, 'low'); });
    it('finds exactly 1 empty OU', function () { assert.equal(f.count, 1); });
    it('identifies EmptyOU', function () {
      assert.equal(f.items[0].Name, 'EmptyOU');
    });
    it('excludes PopulatedOU', function () {
      assert.ok(!f.items.some(function (o) { return o.Name === 'PopulatedOU'; }));
    });
  });

  // ── Empty data ──────────────────────────────────────────────────────────
  describe('with empty dump', function () {
    var empty;
    before(function () {
      empty = adMod.evaluate({ users: [], groups: [], ous: [] });
    });

    it('still returns 6 findings', function () { assert.equal(empty.length, 6); });
    it('all counts are 0', function () {
      empty.forEach(function (f) {
        assert.equal(f.count, 0, f.findingTypeId + ' should have count 0');
      });
    });
  });

  // ── columnDefs exposed ──────────────────────────────────────────────────
  describe('columnDefs', function () {
    it('exposes columnDefs on module object', function () {
      assert.ok(adMod.columnDefs, 'columnDefs should be exposed');
    });
    it('has entry for every finding type', function () {
      var typeIds = ['stale-enabled', 'long-disabled', 'never-expire-acct', 'never-expire-pwd', 'empty-groups', 'empty-ous'];
      typeIds.forEach(function (id) {
        assert.ok(adMod.columnDefs[id], 'missing columnDefs for ' + id);
        assert.ok(Array.isArray(adMod.columnDefs[id]) && adMod.columnDefs[id].length > 0);
      });
    });
  });
});
