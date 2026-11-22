"use strict";

/**
 * Local node metrics: rss, cpu %, live socket count, HTTP p95 latency and
 * 5xx error rate, sampled every 10 s into a 1 h ring (360 samples).
 *
 * The Express timing middleware only records a number per finished request
 * (hrtime + one array push); percentiles are computed once per sample.
 */

const RING_MAX = 360;
const WINDOW_CAP = 4000;

function createMetrics({ cores = 1, now = () => Date.now(), getConns = () => 0 } = {}) {
  let durations = [];
  let seen = 0;
  let requests = 0;
  let errors = 0;
  const ring = [];
  let lastCpu = process.cpuUsage();
  let lastCpuAt = process.hrtime.bigint();
  let last = null;

  function record(ms, status) {
    requests += 1;
    if (status >= 500) errors += 1;
    seen += 1;
    if (durations.length < WINDOW_CAP) durations.push(ms);
    else {
      // Reservoir sampling keeps the percentile honest under heavy load.
      const j = Math.floor(Math.random() * seen);
      if (j < WINDOW_CAP) durations[j] = ms;
    }
  }

  function middleware(req, res, next) {
    const t0 = process.hrtime.bigint();
    res.once("finish", () => {
      record(Number(process.hrtime.bigint() - t0) / 1e6, res.statusCode);
    });
    next();
  }

  function percentile(list, p) {
    if (!list.length) return 0;
    const sorted = [...list].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
  }

  function cpuPct() {
    const usage = process.cpuUsage(lastCpu);
    const at = process.hrtime.bigint();
    const elapsedUs = Number(at - lastCpuAt) / 1000;
    lastCpu = process.cpuUsage();
    lastCpuAt = at;
    if (elapsedUs <= 0) return 0;
    const pct = ((usage.user + usage.system) / elapsedUs / Math.max(1, cores)) * 100;
    return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
  }

  function sample() {
    const mem = process.memoryUsage();
    let conns = 0;
    try {
      conns = Number(getConns()) || 0;
    } catch {
      conns = 0;
    }
    const s = {
      t: now(),
      rss: Math.round(mem.rss / 1048576),
      heap: Math.round(mem.heapUsed / 1048576),
      cpu: cpuPct(),
      conns,
      p95: Math.round(percentile(durations, 95) * 10) / 10,
      err: requests ? Math.round((errors / requests) * 10000) / 10000 : 0,
      reqs: requests,
    };
    durations = [];
    seen = 0;
    requests = 0;
    errors = 0;
    ring.push(s);
    if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
    last = s;
    return s;
  }

  function series(minutes = 60) {
    const since = now() - Math.max(1, Number(minutes) || 60) * 60000;
    return ring.filter((s) => s.t >= since);
  }

  return { middleware, record, sample, series, latest: () => last, ring };
}

module.exports = { createMetrics, RING_MAX };
