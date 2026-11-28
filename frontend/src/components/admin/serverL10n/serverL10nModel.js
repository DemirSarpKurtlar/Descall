/**
 * Topluluk çevirileri (admin, draft C): pure helpers of the editor (tests:
 * serverL10nAdmin.selftest.mjs). Mentions are stored as <#channel-id>; the editor shows
 * them as <#channel-name> (the original name) and turns them back on save.
 */
import { coverageOf, mentionIds, norm } from "../../../lib/serverL10n.js";

export const KIND_GROUPS = ["all", "server", "category", "channel", "topic", "message"];

export function itemKey(it) {
  return `${it.kind}:${String(it.refId).toLowerCase()}`;
}

export function cellKey(it, locale) {
  return `${itemKey(it)}:${locale}`;
}

export function groupOf(it) {
  if (it.kind === "server_name" || it.kind === "server_description") return "server";
  if (it.kind === "channel_name") return it.channelType === "category" ? "category" : "channel";
  if (it.kind === "channel_topic") return "topic";
  return "message";
}

/** "<#id>" -> "<#name>" with the channel's original name (readable in the textarea). */
export function toEditable(text, channels) {
  const byId = new Map((channels || []).map((c) => [String(c.id).toLowerCase(), c]));
  return String(text || "").replace(/<#([0-9a-fA-F-]{36})>/g, (m, id) => {
    const ch = byId.get(id.toLowerCase());
    return ch ? `<#${ch.name}>` : m;
  });
}

/** "<#name>" (original name, case-insensitive) -> "<#id>"; unknown names stay as typed. */
export function fromEditable(text, channels) {
  const byName = new Map((channels || []).filter((c) => c.type !== "category").map((c) => [String(c.name).toLocaleLowerCase("tr"), c]));
  return String(text || "").replace(/<#([^<>]{1,100})>/g, (m, name) => {
    if (/^[0-9a-fA-F-]{36}$/.test(name)) return m;
    const ch = byName.get(String(name).trim().toLocaleLowerCase("tr"));
    return ch ? `<#${ch.id}>` : m;
  });
}

/** Names typed as <#...> that match no channel (shown as a warning before saving). */
export function unknownMentions(editable, channels) {
  const names = new Set((channels || []).map((c) => String(c.name).toLocaleLowerCase("tr")));
  const out = [];
  for (const m of String(editable || "").matchAll(/<#([^<>]{1,100})>/g)) {
    const n = m[1].trim();
    if (/^[0-9a-fA-F-]{36}$/.test(n)) continue;
    if (!names.has(n.toLocaleLowerCase("tr")) && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Items with the unsaved edits / drafts applied to their translations:
 * edits = { cellKey: { text, draft } } ("" = remove).
 */
export function mergeEdits(items, edits) {
  const now = new Date().toISOString();
  return (items || []).map((it) => {
    let changed = false;
    const tr = { ...(it.translations || {}) };
    for (const [k, e] of Object.entries(edits || {})) {
      if (!k.startsWith(`${itemKey(it)}:`)) continue;
      const locale = k.slice(itemKey(it).length + 1);
      changed = true;
      if (!norm(e.text)) delete tr[locale];
      else tr[locale] = { text: e.text, updatedAt: now, sourceText: it.original, stale: false, pending: true, draft: Boolean(e.draft) };
    }
    return changed ? { ...it, translations: tr } : it;
  });
}

/** State of one cell: source | missing | stale | draft | edited | done. */
export function cellState(it, locale, sourceLocale) {
  const row = it.translations?.[locale];
  if (!norm(it.original)) return "empty";
  if (!row || !norm(row.text)) return locale === sourceLocale ? "source" : "missing";
  if (row.draft) return "draft";
  if (row.pending) return "edited";
  if (row.stale) return "stale";
  return "done";
}

export function filterItems(items, { group = "all", status = "all", q = "", locales = [], sourceLocale = "tr" } = {}) {
  const needle = String(q || "").toLocaleLowerCase("tr").trim();
  return (items || []).filter((it) => {
    if (group !== "all" && groupOf(it) !== group) return false;
    if (!norm(it.original) && it.kind !== "channel_topic") return false;
    if (status !== "all") {
      const states = locales.map((l) => cellState(it, l, sourceLocale));
      if (status === "missing" && !states.includes("missing")) return false;
      if (status === "stale" && !states.includes("stale")) return false;
      if (status === "pending" && !states.some((s) => s === "draft" || s === "edited")) return false;
    }
    if (!needle) return true;
    const hay = [it.original, ...Object.values(it.translations || {}).map((r) => r?.text || "")].join(" ").toLocaleLowerCase("tr");
    return hay.includes(needle);
  });
}

/** Items x target locales a "Taslak çevir" run would fill (missing or stale cells). */
export function draftTargets(items, locales, sourceLocale) {
  const targets = locales.filter((l) => l !== sourceLocale);
  const picked = [];
  const cells = new Set();
  for (const it of items || []) {
    if (!norm(it.original)) continue;
    const need = targets.filter((l) => ["missing", "stale"].includes(cellState(it, l, sourceLocale)));
    if (!need.length) continue;
    picked.push({ kind: it.kind, refId: it.refId });
    need.forEach((l) => cells.add(l));
  }
  return { items: picked, locales: [...cells] };
}

/** Body of a save: every pending cell, mentions in the stored form. */
export function saveBody(edits, items, channels) {
  const byKey = new Map((items || []).map((it) => [itemKey(it), it]));
  const out = [];
  for (const [k, e] of Object.entries(edits || {})) {
    const idx = k.lastIndexOf(":");
    const base = k.slice(0, idx);
    const locale = k.slice(idx + 1);
    const it = byKey.get(base);
    if (!it) continue;
    out.push({ kind: it.kind, refId: it.refId, locale, text: fromEditable(e.text, channels) });
  }
  return out;
}

export { coverageOf, mentionIds };
