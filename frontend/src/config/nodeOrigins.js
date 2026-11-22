/**
 * Hybrid server: the owner's PC runs a second backend node behind a Cloudflare Tunnel.
 * One constant for its public origin. Every CSP the app ships (public/security-policy.js,
 * _headers, vercel.json, electron/cspPolicy.cjs, desktop/app/src-tauri/tauri.conf.json)
 * lists exactly these two values; src/config/nodeOrigins.selftest.mjs checks them all.
 * lib/nodeRouting.js only accepts node URLs on this origin (or the primary's).
 */
export const PC_NODE_ORIGIN = "https://pc.descall.com";
export const PC_NODE_WS_ORIGIN = "wss://pc.descall.com";
/** Every secondary node origin the client may be sent to by /api/node/assign. */
export const NODE_ORIGINS = Object.freeze([PC_NODE_ORIGIN]);
