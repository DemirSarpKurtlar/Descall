'use strict';

/**
 * Electron renderer CSP (2.11.2). script-src carries the sha256 of every inline <script> in the
 * shipped dist/index.html (computed at startup from the exact file being loaded) instead of
 * 'unsafe-inline'. If index.html cannot be read the old policy is used so the app still boots.
 */
const crypto = require('crypto');

function inlineScriptHashes(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && !/^(text\/javascript|module|application\/javascript)$/i.test(type)) continue;
    out.push(`'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  }
  return [...new Set(out)];
}

const CONNECT = "connect-src 'self' descall: https://descall.com https://des-call.onrender.com https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://descall.com wss://des-call.onrender.com http://localhost:5173 https://api.github.com https://api.giphy.com https://*.giphy.com https://tenor.googleapis.com https://*.tenor.com https://eu.i.posthog.com https://*.posthog.com https://*.livekit.cloud wss://*.livekit.cloud https://o4512220968779776.ingest.de.sentry.io; ";
const IMG = "img-src 'self' https://descall.com https://des-call.onrender.com https://*.supabase.co https://*.supabase.in https://*.githubusercontent.com https://*.giphy.com https://*.tenor.com https://*.gstatic.com data: blob:; ";
const MEDIA = "media-src 'self' blob: data: https://descall.com https://des-call.onrender.com https://*.supabase.co https://*.supabase.in https://*.giphy.com https://*.tenor.com;";

function buildElectronCsp(indexHtml, { dev = false } = {}) {
  const hashes = indexHtml ? inlineScriptHashes(indexHtml) : null;
  // Dev (Vite on :5173) injects its own inline HMR preamble, keep the permissive policy there.
  const scriptSrc = !dev && hashes && hashes.length
    ? `script-src 'self' ${hashes.join(' ')} 'unsafe-eval'; `
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'; ";
  return "default-src 'self'; " + CONNECT + IMG + scriptSrc + "style-src 'self' 'unsafe-inline'; font-src 'self'; " + MEDIA;
}

module.exports = { buildElectronCsp, inlineScriptHashes };
