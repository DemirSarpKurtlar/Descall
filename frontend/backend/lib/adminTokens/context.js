"use strict";

/**
 * Admin Token request context. Every request (or MCP tool call) authenticated with an
 * admin token runs inside this AsyncLocalStorage, so code anywhere down the chain can
 * tell it apart from a normal owner session:
 *  - runtime/sharedState.appendAudit tags the audit entry's meta with
 *    { actor_via: "token", token_id, token_name } and notes the entry id here, so the
 *    usage log can link the call to the audit entry it wrote.
 */

const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();

function run(ctx, fn) {
  return als.run(ctx, fn);
}

/** { tokenId, tokenName, auditIds: string[] } of the running token request, or null. */
function current() {
  return als.getStore() || null;
}

/** Meta keys added to an audit entry written through a token (kept by adminAuditStore.cleanMeta). */
const AUDIT_TAG_KEYS = Object.freeze(["actor_via", "token_id", "token_name"]);

/** Audit meta with the token tag, when the entry is written inside a token request. */
function tagAuditMeta(meta, entryId) {
  const ctx = current();
  if (!ctx || !ctx.tokenId) return meta;
  if (entryId && Array.isArray(ctx.auditIds) && ctx.auditIds.length < 50) ctx.auditIds.push(String(entryId));
  const base = meta && typeof meta === "object" ? meta : {};
  return { ...base, actor_via: "token", token_id: ctx.tokenId, token_name: ctx.tokenName || null };
}

module.exports = { run, current, tagAuditMeta, AUDIT_TAG_KEYS };
