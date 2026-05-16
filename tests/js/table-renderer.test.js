'use strict';
// Tests for js/table-renderer.js — TableHelpers (pure date utilities)

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('fs');
const path = require('path');

// ── Load module with minimal global stubs ─────────────────────────────────
global.window = global;
global.UI     = { escapeHtml: function (s) { return s; } };
// document not needed — we only test TableHelpers (no DOM calls at load time)

eval(fs.readFileSync(path.join(__dirname, '../../js/table-renderer.js'), 'utf8'));

const TH = global.TableHelpers;

function isoAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

describe('TableHelpers.daysSince', function () {
  it('returns integer days for a valid ISO date', function () {
    var d = TH.daysSince(isoAgo(10));
    assert.ok(d >= 10 && d <= 11, 'expected ~10 days, got ' + d);
  });

  it('returns 0 for right now', function () {
    var d = TH.daysSince(new Date().toISOString());
    assert.ok(d === 0, 'expected 0, got ' + d);
  });

  it('returns null for null input', function () {
    assert.equal(TH.daysSince(null), null);
  });

  it('returns null for undefined', function () {
    assert.equal(TH.daysSince(undefined), null);
  });

  it('returns null for invalid date string', function () {
    assert.equal(TH.daysSince('not-a-date'), null);
  });

  it('handles dates 90 days ago correctly', function () {
    var d = TH.daysSince(isoAgo(90));
    assert.ok(d >= 90 && d <= 91);
  });
});

describe('TableHelpers.formatDate', function () {
  it('returns em-dash for null', function () {
    assert.equal(TH.formatDate(null), '—');
  });

  it('returns em-dash for undefined', function () {
    assert.equal(TH.formatDate(undefined), '—');
  });

  it('returns a non-empty string for a valid date', function () {
    var result = TH.formatDate(isoAgo(30));
    assert.ok(result.length > 0);
    assert.notEqual(result, '—');
  });

  it('returns the raw string for an unparseable date', function () {
    var result = TH.formatDate('garbage-date');
    assert.equal(result, 'garbage-date');
  });
});

describe('TableHelpers.formatDateAge', function () {
  it('returns em-dash for null', function () {
    assert.equal(TH.formatDateAge(null), '—');
  });

  it('includes a day-count span for a real date', function () {
    var result = TH.formatDateAge(isoAgo(45));
    assert.ok(result.includes('45') || result.includes('46'), 'should include age in days');
    assert.ok(result.includes('<span'), 'should include span element');
  });
});
