/**
 * Role, @everyone and @here mentions in server channels (messaging phase 5).
 *
 * Wire format: a role mention is `<@&roleId>` in the plain message text
 * (backend/lib/serverMentions.js decides who it notifies). The composer
 * shows "@Rol adı" while you type and turns the roles you picked into tokens
 * on send; bubbles draw a pill in the role's colour (MessageContent).
 *
 * Roles are known from the servers the app has loaded: registerRoles() keeps
 * id -> { name, color } (role ids are unique across servers).
 */

export const ROLE_TOKEN_SRC = "<@&[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}>";
const ROLE_TOKEN_RE = new RegExp(ROLE_TOKEN_SRC, "g");

const roles = new Map(); // id (lower) -> { id, name, color, serverId }
const listeners = new Set();
let version = 0;

export function roleToken(id) {
  return `<@&${String(id)}>`;
}

/** Role id of a `<@&id>` token, else null. */
export function roleIdOfToken(token) {
  const m = /^<@&([0-9a-fA-F-]{36})>$/.exec(String(token || ""));
  return m ? m[1].toLowerCase() : null;
}

/** "#RRGGBB" for a role colour int (0 = none → null). */
export function roleColorHex(color) {
  const n = Number(color) || 0;
  return n > 0 ? `#${n.toString(16).padStart(6, "0").slice(-6)}` : null;
}

/** Remember a server's roles (from the server bundle / role events). */
export function registerRoles(list, serverId = null) {
  let changed = false;
  for (const r of Array.isArray(list) ? list : []) {
    if (!r?.id || r.isEveryone || r.is_everyone) continue;
    const key = String(r.id).toLowerCase();
    const prev = roles.get(key);
    const next = { id: String(r.id), name: String(r.name || ""), color: Number(r.color) || 0, serverId: serverId || r.serverId || prev?.serverId || null };
    if (!prev || prev.name !== next.name || prev.color !== next.color) {
      roles.set(key, next);
      changed = true;
    }
  }
  if (changed) {
    version += 1;
    for (const fn of listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }
}

export function getRole(id) {
  return roles.get(String(id || "").toLowerCase()) || null;
}
export function subscribeRoles(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function rolesVersion() {
  return version;
}

/** `<@&id>` → "@Rol adı" (unknown roles → `@${fallback}`). */
export function roleTokensToText(text, fallback = "rol") {
  return String(text ?? "").replace(ROLE_TOKEN_RE, (tok) => {
    const r = getRole(roleIdOfToken(tok));
    return `@${r?.name || fallback}`;
  });
}

/** Owner, ADMINISTRATOR or MANAGE_ROLES: may ping any role and @everyone / @here. */
export function canManageMentions(server) {
  if (!server) return false;
  if (server.isOwner || server?.myPermissions?.isOwner) return true;
  const flags = server?.myPermissions?.flags;
  return Boolean(flags && (flags.ADMINISTRATOR || flags.MANAGE_ROLES));
}

const fold = (v) => String(v || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/**
 * Composer suggestions after the people: roles I may ping, then @everyone /
 * @here when I may. Items: { kind: "role", role: { id, name, color, hex } } |
 * { kind: "mass", mass: "everyone" | "here" }.
 */
export function roleSuggestions(server, query = "", { limit = 6 } = {}) {
  if (!server) return [];
  const q = fold(query);
  const manage = canManageMentions(server);
  const list = (Array.isArray(server.roles) ? server.roles : [])
    .filter((r) => r?.id && !r.isEveryone && !r.is_everyone && String(r.name || "").trim())
    .filter((r) => manage || r.mentionable)
    .filter((r) => !q || fold(r.name).includes(q))
    .sort((a, b) => {
      const pa = fold(a.name).startsWith(q) ? 0 : 1;
      const pb = fold(b.name).startsWith(q) ? 0 : 1;
      return pa - pb || (Number(b.position) || 0) - (Number(a.position) || 0);
    })
    .slice(0, limit)
    .map((r) => ({ kind: "role", role: { id: String(r.id), name: String(r.name), color: Number(r.color) || 0, hex: roleColorHex(r.color), mentionable: Boolean(r.mentionable) } }));
  const mass = manage ? ["everyone", "here"].filter((m) => !q || m.startsWith(q)).map((m) => ({ kind: "mass", mass: m })) : [];
  return [...list, ...mass];
}

/**
 * Picked roles become tokens on send: every "@Rol adı" of a role in `picked`
 * (Map name -> id) not followed by a letter or digit. Longest names first so
 * "@Tasarım Ekibi" wins over "@Tasarım".
 */
export function encodeRoleMentions(text, picked) {
  let out = String(text ?? "");
  if (!picked || !picked.size) return out;
  const names = [...picked.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_@<&])@${esc}(?![\\p{L}\\p{N}_])`, "gu");
    out = out.replace(re, (_, pre) => `${pre}${roleToken(picked.get(name))}`);
  }
  return out;
}

/** Tokens back to "@Rol adı" for editing; returns { text, picked }. */
export function decodeRoleMentions(text) {
  const picked = new Map();
  const out = String(text ?? "").replace(ROLE_TOKEN_RE, (tok) => {
    const id = roleIdOfToken(tok);
    const r = getRole(id);
    if (!r?.name) return tok;
    picked.set(r.name, r.id);
    return `@${r.name}`;
  });
  return { text: out, picked };
}

/** Test hook. */
export function __resetRoles() {
  roles.clear();
  version += 1;
}
