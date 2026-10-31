/**
 * Client store for special badges (2026-10-26): the catalog (names, tiers, holder counts),
 * each person's owned badges, and a live "who wears what" map fed by socket events so a
 * badge change shows everywhere (messages, member list, profile) without a refetch.
 */
import { useSyncExternalStore } from "react";
import { getSpecialBadgeCatalog, getUserSpecialBadges, setEquippedSpecialBadge } from "../api/specialBadges";
import { ART_BY_ID, TIER_ORDER } from "../components/badges/specialBadgeArt.jsx";
import { getLocale } from "../i18n/runtime.js";
import { intlTag } from "../i18n/registry.js";

const CATALOG_TTL = 60_000;
const USER_TTL = 30_000;
const listeners = new Set();
let version = 0;
let catalog = { rows: null, at: 0, promise: null, error: null };
const users = new Map(); // userId -> { data, at, promise, error }
const live = new Map(); // userId -> { id, serial } | null

function emit() {
  version += 1;
  for (const fn of listeners) fn();
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const snapshot = () => version;

export const BADGE_TOTAL = Object.keys(ART_BY_ID).length;
export const formatSerial = (n) => `#${String(Math.max(0, Number(n) || 0)).padStart(3, "0")}`;
export const isKnownBadge = (id) => Boolean(id && ART_BY_ID[id]);

// ---- catalog
export function loadCatalog({ fresh = false } = {}) {
  if (!fresh && catalog.rows && Date.now() - catalog.at < CATALOG_TTL) return Promise.resolve(catalog.rows);
  if (catalog.promise) return catalog.promise;
  catalog.promise = getSpecialBadgeCatalog()
    .then((data) => {
      const rows = (Array.isArray(data?.badges) ? data.badges : []).filter((b) => isKnownBadge(b.id));
      catalog = { rows, at: Date.now(), promise: null, error: null };
      emit();
      return rows;
    })
    .catch((err) => {
      catalog = { ...catalog, promise: null, error: err };
      emit();
      throw err;
    });
  return catalog.promise;
}
export function catalogRow(id) {
  return catalog.rows?.find((b) => b.id === id) || null;
}
export function holdersOf(id) {
  const row = catalogRow(id);
  return row ? Number(row.holders) || 0 : null;
}

// ---- someone's badges
export function loadUserBadges(userId, { fresh = false } = {}) {
  if (!userId) return Promise.resolve(null);
  const cur = users.get(userId);
  if (!fresh && cur?.data && Date.now() - cur.at < USER_TTL) return Promise.resolve(cur.data);
  if (cur?.promise) return cur.promise;
  const promise = getUserSpecialBadges(userId)
    .then((data) => {
      const clean = {
        equipped: isKnownBadge(data?.equipped) ? data.equipped : null,
        badges: (Array.isArray(data?.badges) ? data.badges : []).filter((b) => isKnownBadge(b.id)),
      };
      users.set(userId, { data: clean, at: Date.now(), promise: null, error: null });
      const eq = clean.badges.find((b) => b.id === clean.equipped);
      live.set(userId, eq ? { id: eq.id, serial: eq.serial } : null);
      emit();
      return clean;
    })
    .catch((err) => {
      users.set(userId, { ...(users.get(userId) || {}), promise: null, error: err });
      emit();
      throw err;
    });
  users.set(userId, { ...(cur || {}), promise });
  return promise;
}
export function userBadgesState(userId) {
  const cur = users.get(userId);
  return { data: cur?.data || null, error: cur?.error || null, loading: Boolean(cur?.promise) };
}
export function invalidateUser(userId) {
  if (!userId) return;
  const cur = users.get(userId);
  if (cur) users.set(userId, { ...cur, at: 0 });
  emit();
}

// ---- live equipped map
/** Record a profile payload's equippedSpecialBadge (null = took it off). Ignores payloads without the key. */
export function noteEquipped(userId, value) {
  if (!userId || value === undefined) return;
  const next = value && isKnownBadge(value.id) ? { id: value.id, serial: Number(value.serial) || 0 } : null;
  const prev = live.get(userId);
  if (prev === next || (prev && next && prev.id === next.id && prev.serial === next.serial)) return;
  live.set(userId, next);
  const cur = users.get(userId);
  if (cur?.data) users.set(userId, { ...cur, data: { ...cur.data, equipped: next?.id || null, badges: cur.data.badges.map((b) => ({ ...b, equipped: b.id === next?.id })) } });
  emit();
}
/** What a person wears right now: the live map wins over the (possibly stale) user object. */
export function equippedFor(user) {
  const id = user?.id || user?._id;
  if (id && live.has(id)) return live.get(id);
  const v = user?.equippedSpecialBadge;
  return v && isKnownBadge(v.id) ? v : null;
}

/** Wear (or take off with null) one of my badges. Optimistic; reverts and rethrows on failure. */
export async function equipMine(meId, badgeId) {
  const cur = users.get(meId)?.data;
  const prevId = cur?.equipped ?? equippedFor({ id: meId })?.id ?? null;
  const serialOf = (id) => cur?.badges.find((b) => b.id === id)?.serial || 0;
  noteEquipped(meId, badgeId ? { id: badgeId, serial: serialOf(badgeId) } : null);
  try {
    const res = await setEquippedSpecialBadge(badgeId);
    return { previous: prevId, equipped: res?.equipped ?? badgeId ?? null };
  } catch (err) {
    noteEquipped(meId, prevId ? { id: prevId, serial: serialOf(prevId) } : null);
    throw err;
  }
}

// ---- sorting (popup.md default: tier first, then rarer = fewer holders first)
export function sortOwned(list, mode = "tier", nameOf = (id) => id) {
  const rows = [...(list || [])];
  // Badge names are in the UI language, so they sort by its alphabet.
  const collate = intlTag(getLocale());
  if (mode === "new") return rows.sort((a, b) => String(b.grantedAt || "").localeCompare(String(a.grantedAt || "")));
  if (mode === "name") return rows.sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id), collate));
  return rows.sort((a, b) => {
    const ta = TIER_ORDER.indexOf(ART_BY_ID[a.id]?.tier), tb = TIER_ORDER.indexOf(ART_BY_ID[b.id]?.tier);
    return ta - tb || (holdersOf(a.id) ?? 1e9) - (holdersOf(b.id) ?? 1e9) || nameOf(a.id).localeCompare(nameOf(b.id), collate);
  });
}

/** Re-render on any store change. */
export function useSpecialBadgeStore() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Test hook: drop all cached state. */
export function __resetSpecialBadgeStore() {
  catalog = { rows: null, at: 0, promise: null, error: null };
  users.clear();
  live.clear();
  emit();
}
