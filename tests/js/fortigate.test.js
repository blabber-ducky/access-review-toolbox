'use strict';
// Tests for js/modules/fortigate.js — evaluate() findings logic

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

eval(fs.readFileSync(path.join(__dirname, '../../js/modules/fortigate.js'), 'utf8'));

const fgMod = global.window.MODULE_REGISTRY.find(function (m) { return m.id === 'fortigate'; });

// ── Synthetic policies ─────────────────────────────────────────────────────
var policies = [
  // no-traffic: bytes = 0
  { policyid: 1, name: 'dead-rule',    srcaddr: ['10.0.0.0/8'], dstaddr: ['192.168.0.0/16'], service: ['HTTP'],  action: 'accept', bytes: 0    },
  // normal rule with traffic
  { policyid: 2, name: 'web-out',      srcaddr: ['LAN'],        dstaddr: ['all'],             service: ['HTTPS'], action: 'accept', bytes: 1024 },
  // internet (dstaddr = all)
  { policyid: 3, name: 'any-internet', srcaddr: ['DMZ'],        dstaddr: ['all'],             service: ['DNS'],   action: 'accept', bytes: 500  },
  // any-any (src=all, dst=all)
  { policyid: 4, name: 'any-any-rule', srcaddr: ['all'],        dstaddr: ['all'],             service: ['ANY'],   action: 'accept', bytes: 200  },
  // overlapping: same src/dst/service as policyid 5
  { policyid: 5, name: 'dup-a',        srcaddr: ['HR'],         dstaddr: ['Finance'],         service: ['SMB'],   action: 'accept', bytes: 100  },
  { policyid: 6, name: 'dup-b',        srcaddr: ['HR'],         dstaddr: ['Finance'],         service: ['SMB'],   action: 'deny',   bytes: 0    }
];

describe('fortigate.js evaluate()', function () {
  var findings;
  before(function () {
    findings = fgMod.evaluate({ policies: policies });
  });

  it('module is registered', function () { assert.ok(fgMod); });
  it('returns 4 findings', function () { assert.equal(findings.length, 4); });

  it('every finding has required fields', function () {
    findings.forEach(function (f) {
      assert.ok(f.findingTypeId);
      assert.ok(f.label);
      assert.ok(['high', 'medium', 'low', 'info'].includes(f.severity));
      assert.equal(f.count, f.items.length);
    });
  });

  // ── no-traffic ────────────────────────────────────────────────────────
  describe('no-traffic', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'no-traffic'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity medium', function () { assert.equal(f.severity, 'medium'); });
    it('finds rules with 0 bytes or null bytes', function () {
      // policyid 1 (bytes=0) and policyid 6 (bytes=0) match
      assert.ok(f.count >= 1);
      assert.ok(f.items.some(function (p) { return p.policyid === 1; }));
    });
    it('excludes rules with traffic', function () {
      assert.ok(!f.items.some(function (p) { return p.policyid === 2; }));
    });
  });

  // ── overlapping ───────────────────────────────────────────────────────
  describe('overlapping', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'overlapping'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity high', function () { assert.equal(f.severity, 'high'); });
    it('finds the 2 duplicate policies (dup-a and dup-b)', function () {
      assert.ok(f.items.some(function (p) { return p.policyid === 5; }));
      assert.ok(f.items.some(function (p) { return p.policyid === 6; }));
    });
    it('does not include non-duplicate policies', function () {
      // policyid 2 has unique src/dst/service
      assert.ok(!f.items.some(function (p) { return p.policyid === 2; }));
    });
  });

  // ── internet ─────────────────────────────────────────────────────────
  describe('internet', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'internet'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity high', function () { assert.equal(f.severity, 'high'); });
    it('includes rules where dstaddr contains "all"', function () {
      assert.ok(f.items.some(function (p) { return p.policyid === 2; }));
      assert.ok(f.items.some(function (p) { return p.policyid === 3; }));
      assert.ok(f.items.some(function (p) { return p.policyid === 4; }));
    });
    it('excludes rules with specific destinations', function () {
      assert.ok(!f.items.some(function (p) { return p.policyid === 1; }));
    });
  });

  // ── any-any ───────────────────────────────────────────────────────────
  describe('any-any', function () {
    var f;
    before(function () { f = findings.find(function (x) { return x.findingTypeId === 'any-any'; }); });

    it('exists', function () { assert.ok(f); });
    it('has severity high', function () { assert.equal(f.severity, 'high'); });
    it('finds exactly the any-any rule', function () {
      assert.equal(f.count, 1);
      assert.equal(f.items[0].policyid, 4);
    });
    it('excludes single-any rules (internet-only)', function () {
      // policyid 2 and 3 have dstaddr=all but srcaddr is specific
      assert.ok(!f.items.some(function (p) { return p.policyid === 2; }));
      assert.ok(!f.items.some(function (p) { return p.policyid === 3; }));
    });
  });

  // ── empty data ────────────────────────────────────────────────────────
  describe('with empty dump', function () {
    var empty;
    before(function () { empty = fgMod.evaluate({ policies: [] }); });

    it('returns 4 findings', function () { assert.equal(empty.length, 4); });
    it('all counts are 0', function () {
      empty.forEach(function (f) { assert.equal(f.count, 0, f.findingTypeId + ' should be 0'); });
    });
  });
});
