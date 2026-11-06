'use strict';

/**
 * Tiny registry between main.cjs and premium modules that need main internals:
 *  - main.cjs sets 'registerAppProtocolOn' (descall:// handler on another session) and
 *    'mediaPermissions';
 *  - multi_account sets 'tokenFileForSession' so main's secure-token handlers can keep a
 *    separate token file per account partition.
 * No electron import.
 */

const hooks = new Map();

function set(name, value) {
  if (value == null) hooks.delete(name);
  else hooks.set(name, value);
}

function get(name) {
  return hooks.get(name);
}

/** Token file for a webContents on a premium account partition, or null for the main session. */
function tokenFileForSender(sender) {
  const fn = hooks.get('tokenFileForSession');
  if (!fn || !sender) return null;
  try { return fn(sender.session) || null; } catch (_) { return null; }
}

module.exports = { set, get, tokenFileForSender };
