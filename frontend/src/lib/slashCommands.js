import { casinoHiddenOnThisDevice } from "./casinoCommands.js";
import { getLocale, t } from "../i18n/runtime.js";
import { formatNumber } from "../i18n/format.js";

/**
 * Composer slash commands (2.12.0, design/slash-commands-2026-10-18).
 * One row per command; aliases are chips on that row. Labels, descriptions, argument
 * hints and search keywords come from the `slash.*` catalog (i18n/locales/slash.*.js)
 * and are read when they are used, so they follow the UI language. Command names and
 * aliases are what users type and stay the same in every language.
 *
 * Surfaces: server text channel, group DM, and 1:1 DM (casino + `dm: true`).
 * In a server channel a command the member may not run stays in the list,
 * greyed out with a lock (`locked: true` + `lockReason`); the server checks again.
 */

const withText = (obj, props) => {
  for (const [name, get] of Object.entries(props)) Object.defineProperty(obj, name, { get, enumerable: true, configurable: true });
  return obj;
};

export const SLASH_GROUPS = [
  { id: "general", color: "#6d8cff", gradient: "linear-gradient(160deg,#6d8cff,#4a5fe0)" },
  { id: "moderation", color: "#ff7a6b", gradient: "linear-gradient(160deg,#ff7a6b,#e0455f)" },
  { id: "games", color: "#b77bff", gradient: "linear-gradient(160deg,#b77bff,#7a4fe0)" },
  { id: "credits", color: "#ffc95c", gradient: "linear-gradient(160deg,#ffc95c,#e79a2c)" },
].map((g) => withText(g, { label: () => t(`slash.group.${g.id}`) }));

export const SLASH_GROUP_BY_ID = Object.fromEntries(SLASH_GROUPS.map((g) => [g.id, g]));

const PERMISSIONS = [
  "USE_APPLICATION_COMMANDS",
  "SEND_MESSAGES",
  "MODERATE_MEMBERS",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "MANAGE_MESSAGES",
  "CHANGE_NICKNAME",
];

/** Labels for the permission a locked command needs (UI language). */
export const PERMISSION_LABELS = withText(
  {},
  Object.fromEntries(PERMISSIONS.map((p) => [p, () => t(`slash.perm.${p}`)]))
);

/** Argument hint; `key` is a `slash.arg.*` key, `literal` is shown as written ("1–100"). */
const a = (key, optional = false) => withText({ key, optional }, { name: () => t(`slash.arg.${key}`) });
const lit = (text, optional = false) => ({ key: text, name: text, optional });

/**
 * `use`: usage lines as [code, noteKey]. A code that starts with "/" is shown as
 * written, "alias:N" shows the Nth alias, anything else is a key under
 * `slash.cmd.<name>`; noteKey is a key there too.
 */
export const SLASH_COMMANDS = [
  // General
  {
    name: "poll", aliases: ["anket"], group: "general", isNew: true,
    args: [a("question"), a("options", true)],
    use: [["/poll", "use1Note"], ["use2", "use2Note"]],
    insert: "/poll", dm: true, permission: "SEND_MESSAGES",
  },
  {
    name: "user", group: "general", args: [a("user", true)],
    use: [["use1", "use1Note"]],
    insert: "/user ", userArg: true, dm: true, permission: "USE_APPLICATION_COMMANDS",
  },
  {
    name: "avatar", group: "general", args: [a("user", true)],
    use: [["use1", "use1Note"]],
    insert: "/avatar ", userArg: true, dm: true, permission: "USE_APPLICATION_COMMANDS",
  },
  {
    name: "server", group: "general", args: [],
    use: [["/server"]],
    insert: "/server", serverOnly: true, permission: "USE_APPLICATION_COMMANDS",
  },
  {
    name: "nick", group: "general", args: [a("name", true)],
    use: [["use1"], ["/nick", "use2Note"]],
    insert: "/nick ", serverOnly: true, permission: "CHANGE_NICKNAME",
  },
  {
    name: "help", aliases: ["yardım"], group: "general", args: [],
    use: [["/help"], ["alias:0", "use2Note"]],
    insert: "/help", dm: true, permission: "USE_APPLICATION_COMMANDS",
  },
  // Moderation
  {
    name: "timeout", group: "moderation", args: [a("user"), a("duration"), a("reason", true)],
    use: [["use1", "use1Note"]],
    insert: "/timeout ", userArg: true, durationArg: true, serverOnly: true, permission: "MODERATE_MEMBERS",
  },
  {
    name: "kick", group: "moderation", args: [a("user"), a("reason", true)],
    use: [["use1"]],
    insert: "/kick ", userArg: true, serverOnly: true, permission: "KICK_MEMBERS",
  },
  {
    name: "ban", group: "moderation", args: [a("user"), a("reason", true)],
    use: [["use1"]],
    insert: "/ban ", userArg: true, confirm: true, serverOnly: true, permission: "BAN_MEMBERS",
  },
  {
    name: "purge", group: "moderation", args: [lit("1–100")],
    use: [["/purge 10"]],
    insert: "/purge ", countArg: true, serverOnly: true, permission: "MANAGE_MESSAGES",
  },
  // Games
  {
    name: "bj", aliases: ["blackjack"], group: "games", args: [a("bet")],
    use: [["/bj 100"]], insert: "/bj 100", casino: true,
  },
  {
    name: "slot", group: "games", args: [a("bet")],
    use: [["/slot 100"]], insert: "/slot 100", casino: true,
  },
  {
    name: "coinflip", aliases: ["cf"], group: "games", args: [a("bet"), a("side", true)],
    use: [["use1"]], insert: "/coinflip 100", casino: true,
  },
  // Credits
  {
    name: "pay", aliases: ["gonder", "send", "tip"], group: "credits", args: [a("user"), a("amount")],
    use: [["use1"]], insert: "/pay ", userArg: true, casino: true,
  },
  {
    name: "daily", group: "credits", args: [],
    use: [["/daily"]], insert: "/daily", casino: true,
  },
  {
    name: "credits", aliases: ["bakiye", "balance"], group: "credits", args: [],
    use: [["/credits"]], insert: "/credits", casino: true,
  },
  {
    name: "top", aliases: ["lider"], group: "credits", args: [],
    use: [["/top"]], insert: "/top", casino: true,
  },
];

function usageCode(cmd, code) {
  if (code.startsWith("/")) return code;
  if (code.startsWith("alias:")) return `/${cmd.aliases[Number(code.slice(6))] || cmd.name}`;
  return t(`slash.cmd.${cmd.name}.${code}`);
}

for (const cmd of SLASH_COMMANDS) {
  const k = `slash.cmd.${cmd.name}`;
  const hasDetail = cmd.group === "general" || cmd.group === "moderation";
  withText(cmd, {
    label: () => t(`${k}.label`),
    description: () => t(`${k}.description`),
    detail: () => (hasDetail ? t(`${k}.detail`) : undefined),
    usage: () => cmd.use.map(([code, note]) => [usageCode(cmd, code), note ? t(`${k}.${note}`) : ""]),
    keywords: () => t(`${k}.keywords`).split(",").map((s) => s.trim()).filter(Boolean),
  });
  cmd.chatOnly = true;
  cmd.aliases = cmd.aliases || [];
  cmd.contexts = cmd.serverOnly ? ["server"] : cmd.casino || cmd.dm ? ["server", "group", "dm"] : ["server", "group"];
}

const DM_COMMAND_NAMES = new Set(
  SLASH_COMMANDS.filter((c) => c.casino || c.dm).flatMap((c) => [c.name, ...(c.aliases || [])])
);

/** Why a server member cannot run `cmd` here, or null when they can. */
function lockFor(cmd, { permissionFlags, isOwner }) {
  if (cmd.casino || isOwner || permissionFlags.ADMINISTRATOR) return null;
  if (cmd.permission === "SEND_MESSAGES") {
    // /poll needs only Send Messages (decision 2026-10-19), not the app-command gate.
    return permissionFlags.SEND_MESSAGES === false ? "SEND_MESSAGES" : null;
  }
  if (!permissionFlags.USE_APPLICATION_COMMANDS) return "USE_APPLICATION_COMMANDS";
  if (cmd.permission && cmd.permission !== "USE_APPLICATION_COMMANDS" && !permissionFlags[cmd.permission]) {
    return cmd.permission;
  }
  return null;
}

export function getSlashCommandsForSurface({
  activeChannel,
  activeGroup,
  activeDmUser,
  permissionFlags = {},
  isOwner = false,
  hideCasino = casinoHiddenOnThisDevice(),
} = {}) {
  const inServerText = activeChannel?.type === "text";
  const inGroup = !inServerText && Boolean(activeGroup);
  const inDm = !inServerText && !inGroup && Boolean(activeDmUser?.id);
  if (!inServerText && !inGroup && !inDm) return [];

  return SLASH_COMMANDS.filter((cmd) => {
    // Native iOS app: no casino commands in the picker.
    if (hideCasino && cmd.casino) return false;
    if (cmd.serverOnly && !inServerText) return false;
    if (inDm && !cmd.casino && !cmd.dm) return false;
    return true;
  }).map((cmd) => {
    const lock = inServerText ? lockFor(cmd, { permissionFlags, isOwner }) : null;
    return {
      ...cmd,
      aliases: cmd.aliases || [],
      id: cmd.name,
      command: `/${cmd.name}`,
      hint: cmd.description,
      locked: Boolean(lock),
      lockPermission: lock,
      lockReason: lock ? t("slash.lockReason", { perm: PERMISSION_LABELS[lock] || lock }) : null,
    };
  });
}

/** Turkish-aware folding: case and dotted/dotless i, ş→s, ğ→g, ü→u, ö→o, ç→c. */
export function foldTr(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wordPrefixIndex(text, q) {
  const f = foldTr(text);
  if (f.startsWith(q)) return 0;
  const re = /[\s·,/–-]+/g;
  let m;
  while ((m = re.exec(f)) !== null) {
    const at = m.index + m[0].length;
    if (f.startsWith(q, at)) return at;
  }
  return -1;
}

function subsequence(text, q) {
  const f = foldTr(text);
  const idx = [];
  let j = 0;
  for (let i = 0; i < f.length && j < q.length; i += 1) if (f[i] === q[j]) { idx.push(i); j += 1; }
  return j === q.length ? idx : null;
}

/**
 * Fuzzy search, ranked: name prefix · alias prefix · label word prefix ·
 * keyword prefix · subsequence of name · description contains.
 * Each hit carries `highlight: { field, ranges: [[start, end]] }` for <mark>.
 */
export function searchSlashCommands(commands, query) {
  const q = foldTr(query).trim();
  if (!q) return (commands || []).map((cmd) => ({ ...cmd, matchedAlias: null, score: 0, highlight: null }));
  const out = [];
  for (const cmd of commands || []) {
    let best = null;
    const take = (score, extra) => {
      if (!best || score > best.score) best = { score, ...extra };
    };
    if (foldTr(cmd.name).startsWith(q)) take(100 - cmd.name.length / 100, { highlight: { field: "name", ranges: [[0, q.length]] } });
    const alias = (cmd.aliases || []).find((al) => foldTr(al).startsWith(q));
    if (alias) take(90, { matchedAlias: alias, highlight: { field: "alias", alias, ranges: [[0, q.length]] } });
    const li = wordPrefixIndex(cmd.label, q);
    if (li >= 0) take(80 - li / 100, { highlight: { field: "label", ranges: [[li, li + q.length]] } });
    if ((cmd.keywords || []).some((k) => foldTr(k).startsWith(q))) take(70, { highlight: null });
    if (q.length >= 2) {
      const seq = subsequence(cmd.name, q);
      if (seq) take(50, { highlight: { field: "name", ranges: seq.map((i) => [i, i + 1]) } });
    }
    const di = foldTr(cmd.description).indexOf(q);
    if (di >= 0 && q.length >= 2) take(40 - di / 1000, { highlight: { field: "description", ranges: [[di, di + q.length]] } });
    if (best) out.push({ ...cmd, matchedAlias: best.matchedAlias || null, score: best.score, highlight: best.highlight || null });
  }
  return out.sort((x, y) => y.score - x.score);
}

/** The slash token being typed, or null once arguments start ("/user yi" → null). */
export function slashQueryOf(message) {
  const raw = String(message || "");
  if (!raw.startsWith("/")) return null;
  const firstToken = raw.split(/\s/)[0] || "";
  if (raw.includes(" ") && firstToken.length > 1) return null;
  if (firstToken.startsWith("//")) return null;
  return firstToken.slice(1);
}

/**
 * Same rules as the composer picker: only a leading slash token, before arguments.
 * A command matches by its name, alias, label, keyword or description (UI language).
 */
export function filterSlashCommandMatches(commands, message) {
  if (!commands?.length) return [];
  const q = slashQueryOf(message);
  if (q === null) return [];
  return searchSlashCommands(commands, q);
}

/** Text to put in the composer for a picked command (keeps a typed alias). */
export function slashInsertText(cmd) {
  if (!cmd) return "";
  if (cmd.matchedAlias && cmd.insert.startsWith(`/${cmd.name}`)) {
    return `/${cmd.matchedAlias}${cmd.insert.slice(cmd.name.length + 1)}`;
  }
  return cmd.insert;
}

/** Matches grouped for the menu, in SLASH_GROUPS order; empty groups dropped. */
export function groupSlashMatches(matches) {
  return SLASH_GROUPS.map((g) => ({ ...g, items: matches.filter((m) => (m.group || "general") === g.id) })).filter(
    (g) => g.items.length > 0
  );
}

/**
 * Menu sections. Without a query: category order. With one: the best hit under
 * the "best match" label, the rest grouped by category in rank order.
 */
export function slashMenuSections(matches, { query = "", category = "all" } = {}) {
  const list = category === "all" ? matches : matches.filter((m) => m.group === category);
  if (!list.length) return [];
  if (!foldTr(query).trim()) return groupSlashMatches(list).map((g) => ({ id: g.id, label: g.label, items: g.items }));
  const [best, ...rest] = list;
  const sections = [{ id: "best", label: t("slash.bestMatch"), items: [best] }];
  for (const g of SLASH_GROUPS) {
    const items = rest.filter((m) => m.group === g.id);
    if (items.length) sections.push({ id: g.id, label: g.label, items });
  }
  return sections;
}

/** Commands for the empty state (frequently used). */
export const FREQUENT_COMMANDS = ["poll", "user", "avatar", "server", "help"];

/** The first command name of a slash text, lower-cased with Turkish rules. */
export function slashNameOf(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("/")) return "";
  return trimmed.slice(1).split(/\s+/)[0].toLocaleLowerCase("tr");
}

export function findSlashCommand(name) {
  const n = String(name || "").toLocaleLowerCase("tr");
  return SLASH_COMMANDS.find((c) => c.name === n || (c.aliases || []).includes(n)) || null;
}

/** A 1:1 DM message the server runs as a command instead of storing as text. */
export function isDmSlashCommand(text) {
  const name = slashNameOf(text);
  if (!name) return false;
  return DM_COMMAND_NAMES.has(name) || ["hit", "stand", "stay", "double", "commands", "yardim", "komutlar"].includes(name);
}

/** "5 dk." / "5 min", "1 hafta" / "1 week" in the UI language (Intl unit names). */
export function durationLabel(value, unit, unitDisplay = "short") {
  return formatNumber(value, getLocale(), { style: "unit", unit, unitDisplay });
}

const dur = (token, seconds, value, unit, display) => withText({ token, seconds }, { label: () => durationLabel(value, unit, display) });

/** Timeout duration chips (label → server token). */
export const TIMEOUT_DURATIONS = [
  dur("60s", 60, 60, "second", "short"),
  dur("5m", 300, 5, "minute", "short"),
  dur("10m", 600, 10, "minute", "short"),
  dur("1h", 3600, 1, "hour", "short"),
  dur("1d", 86400, 1, "day", "long"),
  dur("1w", 604800, 1, "week", "long"),
];

export const PURGE_COUNTS = [10, 25, 50, 100];

/**
 * Where the caret is inside a command's arguments, for the picker step:
 * { cmd, argIndex, argText } or null. "/timeout @yi" → user arg, "yi".
 */
export function slashArgState(message) {
  const raw = String(message || "");
  const m = /^\/(\S+)\s(.*)$/su.exec(raw);
  if (!m) return null;
  const cmd = findSlashCommand(m[1]);
  if (!cmd || !cmd.args?.length) return null;
  const rest = m[2];
  const parts = rest.split(" ");
  const argIndex = parts.length - 1;
  return { cmd, argIndex, argText: parts[argIndex] || "", before: parts.slice(0, -1) };
}
