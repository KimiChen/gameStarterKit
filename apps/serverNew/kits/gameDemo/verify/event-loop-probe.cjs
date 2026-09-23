'use strict'
// Test-only preload, inherited by the real master's children through NODE_OPTIONS.
// This observes each process; it does not measure the load generator's event loop.
const { monitorEventLoopDelay } = require('node:perf_hooks')
const histogram = monitorEventLoopDelay({ resolution: 10 })
histogram.enable()
setInterval(() => {
    console.log('[gameDemo-event-loop] ' + JSON.stringify({ pid: process.pid, at: Date.now(), p95Ms: histogram.percentile(95) / 1e6, maxMs: histogram.max / 1e6 }))
    histogram.reset()
}, 1000).unref()
