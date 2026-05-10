/* ── ps-bridge.js — POST /api/dump + job polling ────────────────────────── */
(function () {
  'use strict';

  var _pollInterval = null;

  function startDump(moduleId, configPath) {
    return new Promise(function (resolve, reject) {
      fetch('/api/dump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: moduleId, configPath: configPath })
      })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.status !== 'started') { reject(new Error(res.error || 'Failed to start')); return; }
        _pollJob(res.jobId, resolve, reject);
      })
      .catch(reject);
    });
  }

  function _pollJob(jobId, resolve, reject) {
    UI.showProgress(0, 'Starting...');

    _pollInterval = setInterval(function () {
      fetch('/api/dump/status?jobId=' + encodeURIComponent(jobId))
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.status === 'running') {
            UI.showProgress(res.progress || 0, res.message || 'Running...');
          } else if (res.status === 'done') {
            clearInterval(_pollInterval);
            UI.showProgress(100, 'Complete');
            setTimeout(function () { UI.hideProgress(); }, 800);
            resolve(res.dumpPath);
          } else if (res.status === 'error') {
            clearInterval(_pollInterval);
            UI.hideProgress();
            reject(new Error(res.message || 'Collection failed'));
          }
        })
        .catch(function (e) {
          clearInterval(_pollInterval);
          UI.hideProgress();
          reject(e);
        });
    }, 2000);
  }

  window.PSBridge = { startDump };
})();
