#!/usr/bin/env node
'use strict';
// JS test entry point — delegates to node:test built-in test runner.
// Run: node tests/js/run-tests.js
// Or:  node --test tests/js/

const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const path = require('path');

const files = [
  'table-renderer.test.js',
  'ad.test.js',
  'fortigate.test.js',
  'f5.test.js'
].map(function (f) { return path.join(__dirname, f); });

run({ files: files })
  .compose(new spec())
  .pipe(process.stdout);
