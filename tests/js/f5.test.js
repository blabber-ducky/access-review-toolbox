'use strict';
// Tests for js/modules/f5.js — evaluate() findings logic

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Global stubs ───────────────────────────────────────────────────────────
global.window = global;
global.window.MODULE_REGISTRY = [];
global.renderTable  = function () {};
global.TableHelpers = { daysSince: function () { return null; }, formatDate: function (v) { return v || ''; }, formatDateAge: function (v) { return v || ''; } };
global.UI = { escapeHtml: function (s) { return s; } };

eval(fs.readFileSync(path.join(__dirname, '../../js/modules/f5.js'), 'utf8'));

const f5Mod = global.window.MODULE_REGISTRY.find(function (m) { return m.id === 'f5'; });

// ── Synthetic data ─────────────────────────────────────────────────────────
var policies = [
  { name: '/Common/strict-policy',    enforcementMode: 'blocking',     complianceScore: 10, active: true,  virtualServers: ['vs-web'],  pools: ['pool-web']    },
  { name: '/Common/learning-policy',  enforcementMode: 'transparent',  complianceScore: 7,  active: true,  virtualServers: ['vs-api'],  pools: ['pool-api']    },
  { name: '/Common/low-score-policy', enforcementMode: 'blocking',     complianceScore: 5,  active: true,  virtualServers: ['vs-mgmt'], pools: ['pool-mgmt']   }
];

var pools = [
  { name: 'pool-web',         memberCount: 3, monitor: 'http',  loadBalancing: 'round-robin' },
  { name: 'pool-api',         memberCount: 2, monitor: 'https', loadBalancing: 'least-conn'  },
  { name: 'pool-mgmt',        memberCount: 1, monitor: 'tcp',   loadBalancing: 'round-robin' },
  { name: 'pool-unprotected', memberCount: 2, monitor: 'tcp',   loadBalancing: 'round-robin' }
];

describe('f5.js evaluate()', function () {
  var findings;
  before(function () {
    findings = f5Mod.evaluate({ 'security-policies': policies, pools: pools });
  });

  it('module is registered', function () { assert.ok(f5Mod); });
  it('returns 3 findings', function () { assert.equal(findings.length, 3); });

  it('every finding has required fields', function () {
    findings.forEach(function (f) {
      assert.ok(f.findingTypeId);
      assert.ok(f.label);
      assert.ok(['high', 'medium', 'low', 'info'].includes(f.severity));
      assert.equal(f.count, f.items.length);
    });
  });

  // ── learning-mode ─────────────────────────────────────────────────────
  describe('learning-mode', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'learning-mode'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity high', function () { assert.equal(f.severity, 'high'); });
    it('finds exactly 1 policy in learning mode', function () { assert.equal(f.count, 1); });
    it('identifies learning-policy', function () {
      assert.ok(f.items[0].name.includes('learning-policy'));
    });
    it('excludes blocking mode policies', function () {
      assert.ok(!f.items.some(function (p) { return p.enforcementMode === 'blocking'; }));
    });
  });

  // ── not-owasp-10 ─────────────────────────────────────────────────────
  describe('not-owasp-10', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'not-owasp-10'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity high', function () { assert.equal(f.severity, 'high'); });
    it('finds 2 policies below score 10', function () { assert.equal(f.count, 2); });
    it('includes learning-policy (score 7)', function () {
      assert.ok(f.items.some(function (p) { return p.name.includes('learning-policy'); }));
    });
    it('includes low-score-policy (score 5)', function () {
      assert.ok(f.items.some(function (p) { return p.name.includes('low-score-policy'); }));
    });
    it('excludes strict-policy (score 10)', function () {
      assert.ok(!f.items.some(function (p) { return p.name.includes('strict-policy'); }));
    });
  });

  // ── pools-no-policy ───────────────────────────────────────────────────
  describe('pools-no-policy', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'pools-no-policy'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity medium', function () { assert.equal(f.severity, 'medium'); });
    it('finds exactly 1 unprotected pool', function () { assert.equal(f.count, 1); });
    it('identifies pool-unprotected', function () {
      assert.equal(f.items[0].name, 'pool-unprotected');
    });
    it('excludes pools that are referenced by a policy', function () {
      assert.ok(!f.items.some(function (p) { return p.name === 'pool-web'; }));
      assert.ok(!f.items.some(function (p) { return p.name === 'pool-api'; }));
      assert.ok(!f.items.some(function (p) { return p.name === 'pool-mgmt'; }));
    });
  });

  // ── /Common/ prefix stripping ─────────────────────────────────────────
  describe('pool name prefix stripping', function () {
    it('treats /Common/pool-x and pool-x as the same pool', function () {
      var policiesWithPrefix = [
        { name: 'p1', enforcementMode: 'blocking', complianceScore: 10, pools: ['/Common/prefixed-pool'] }
      ];
      var poolsWithName = [
        { name: 'prefixed-pool', memberCount: 1 }
      ];
      var r = f5Mod.evaluate({ 'security-policies': policiesWithPrefix, pools: poolsWithName });
      var unprotected = r.find(function (x) { return x.findingTypeId === 'pools-no-policy'; });
      assert.equal(unprotected.count, 0, 'prefixed-pool should match /Common/prefixed-pool');
    });
  });

  // ── empty data ────────────────────────────────────────────────────────
  describe('with empty dump', function () {
    var empty;
    before(function () { empty = f5Mod.evaluate({ 'security-policies': [], pools: [] }); });

    it('returns 3 findings', function () { assert.equal(empty.length, 3); });
    it('all counts are 0', function () {
      empty.forEach(function (f) { assert.equal(f.count, 0, f.findingTypeId + ' should be 0'); });
    });
  });
});
