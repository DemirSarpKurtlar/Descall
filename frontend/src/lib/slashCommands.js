import { casinoHiddenOnThisDevice } from "./casinoCommands.js";

/**
 * Composer slash commands (2.12.0, design/slash-commands-2026-10-18).
 * One row per command; aliases are chips on that row. Labels are Turkish.
 *
 * Surfaces: server text channel, group DM, and 1:1 DM (casino + `dm: true`).
 * In a server channel a command the member may not run stays in the list,
 * greyed out with a lock (`locked: true` + `lockReason`); the server checks again.
 */

export const SLASH_GROUPS = [
  { id: "general", label: "Genel", color: "#6d8cff", gradient: "linear-gradient(160deg,#6d8cff,#4a5fe0)" },
  { id: "moderation", label: "Moderasyon", color: "#ff7a6b", gradient: "linear-gradient(160deg,#ff7a6b,#e0455f)" },
  { id: "games", label: "Oyunlar", color: "#b77bff", gradient: "linear-gradient(160deg,#b77bff,#7a4fe0)" },
  { id: "credits", label: "Kredi", color: "#ffc95c", gradient: "linear-gradient(160deg,#ffc95c,#e79a2c)" },
];

export const SLASH_GROUP_BY_ID = Object.fromEntries(SLASH_GROUPS.map((g) => [g.id, g]));

/** Turkish labels for the permission a locked command needs. */
export const PERMISSION_LABELS = {
  USE_APPLICATION_COMMANDS: "Uygulama komutlarını kullan",
  SEND_MESSAGES: "Mesaj gönder",
  MODERATE_MEMBERS: "Üyeleri sustur",
  KICK_MEMBERS: "Üyeleri at",
  BAN_MEMBERS: "Üyeleri yasakla",
  MANAGE_MESSAGES: "Mesajları yönet",
  CHANGE_NICKNAME: "Takma ad değiştir",
};

const a = (name, optional = false) => ({ name, optional });

export const SLASH_COMMANDS = [
  // Genel
  {
    name: "poll", aliases: ["anket"], group: "general", label: "Anket", isNew: true,
    args: [a("soru"), a("seçenekler…", true)],
    description: "Oylanabilir anket başlat, süre ve emoji ile",
    detail: "Soru, 2–10 seçenek (emoji ile), süre ve anonimlik seçerek oylanabilir bir anket kartı gönderir. Sonuçlar canlı güncellenir.",
    usage: [["/poll", "↵ ile anket oluşturucu açılır"], ["/poll Soru | Evet | Hayır", "hızlı yol: doğrudan gönderir"]],
    keywords: ["oylama", "oy", "anket", "seçim"],
    insert: "/poll", dm: true, permission: "SEND_MESSAGES", permissionLabel: "Mesaj gönder",
  },
  {
    name: "user", group: "general", label: "Kullanıcı kartı", args: [a("@kullanıcı", true)],
    description: "Profil kartını göster: roller, rozetler, tarihler",
    detail: "Bir üyenin profil kartını gösterir: banner, avatar çerçevesi, rozetler, sunucu rolleri ve katılım tarihleri.",
    usage: [["/user [@kullanıcı]", "isteğe bağlı · boş bırakırsan kendi kartın"]],
    keywords: ["kullanıcı", "profil", "kim", "üye"],
    insert: "/user ", userArg: true, dm: true, permission: "USE_APPLICATION_COMMANDS",
  },
  {
    name: "avatar", group: "general", label: "Avatar", args: [a("@kullanıcı", true)],
    description: "Avatarı büyük göster, indir veya tam ekran aç",
    detail: "Bir üyenin avatarını büyük gösterir. Tam ekran açabilir, indirebilir ya da bağlantısını kopyalayabilirsin.",
    usage: [["/avatar [@kullanıcı]", "boş bırakırsan kendi avatarın"]],
    keywords: ["resim", "fotoğraf", "pp", "profil", "kullanıcı"],
    insert: "/avatar ", userArg: true, dm: true, permission: "USE_APPLICATION_COMMANDS",
  },
  {
    name: "server", group: "general", label: "Sunucu bilgisi", args: [],
    description: "Üye, kanal, rol sayısı ve sunucu sahibi",
    detail: "Sunucunun üye, çevrimiçi, kanal ve rol sayılarını, sahibini ve oluşturulma tarihini gösterir.",
    usage: [["/server", ""]],
    keywords: ["sunucu", "bilgi"],
    insert: "/server", serverOnly: true, permission: "USE_APPLICATION_COMMANDS",
  },
  {
    name: "nick", group: "general", label: "Takma ad", args: [a("ad", true)],
    description: "Bu sunucudaki takma adını değiştir",
    detail: "Bu sunucudaki takma adını değiştirir. Boş bırakırsan takma adın temizlenir.",
    usage: [["/nick Yeni ad", ""], ["/nick", "takma adı temizler"]],
    keywords: ["isim", "takma", "ad"],
    insert: "/nick ", serverOnly: true, permission: "CHANGE_NICKNAME",
  },
  {
    name: "help", aliases: ["yardım"], group: "general", label: "Yardım", args: [],
    description: "Burada kullanabileceğin komutları listele",
    detail: "Bu kanalda ya da sohbette kullanabileceğin komutları kategorilere ayırarak listeler.",
    usage: [["/help", ""], ["/yardım", "aynı komut"]],
    keywords: ["yardım", "komutlar", "liste"],
    insert: "/help", dm: true, permission: "USE_APPLICATION_COMMANDS",
  },
  // Moderasyon
  {
    name: "timeout", group: "moderation", label: "Sustur", args: [a("@kullanıcı"), a("süre"), a("sebep", true)],
    description: "Üyeyi belirli bir süre sustur",
    detail: "Üye süre bitene kadar mesaj yazamaz, tepki veremez ve sesli kanaldan çıkarılır. En fazla 28 gün.",
    usage: [["/timeout @kullanıcı 5m sebep", "60s · 5m · 1h · 1d · 1w"]],
    keywords: ["sustur", "mute", "zaman aşımı", "kullanıcı"],
    insert: "/timeout ", userArg: true, durationArg: true, serverOnly: true, permission: "MODERATE_MEMBERS",
  },
  {
    name: "kick", group: "moderation", label: "At", args: [a("@kullanıcı"), a("sebep", true)],
    description: "Üyeyi sunucudan at",
    detail: "Üyeyi sunucudan çıkarır. Davet bağlantısıyla tekrar katılabilir. Denetim kaydına yazılır.",
    usage: [["/kick @kullanıcı sebep", ""]],
    keywords: ["at", "çıkar", "kullanıcı"],
    insert: "/kick ", userArg: true, serverOnly: true, permission: "KICK_MEMBERS",
  },
  {
    name: "ban", group: "moderation", label: "Yasakla", args: [a("@kullanıcı"), a("sebep", true)],
    description: "Üyeyi sunucudan yasakla",
    detail: "Üyeyi sunucudan çıkarır ve tekrar katılmasını engeller. Göndermeden önce onay istenir.",
    usage: [["/ban @kullanıcı sebep", ""]],
    keywords: ["yasakla", "engelle", "kullanıcı"],
    insert: "/ban ", userArg: true, confirm: true, serverOnly: true, permission: "BAN_MEMBERS",
  },
  {
    name: "purge", group: "moderation", label: "Toplu sil", args: [a("1–100")],
    description: "Kanaldaki son N mesajı sil",
    detail: "Bu kanaldaki son 1–100 mesajı siler. Silinen mesajlar geri getirilemez.",
    usage: [["/purge 10", ""]],
    keywords: ["sil", "temizle", "toplu"],
    insert: "/purge ", countArg: true, serverOnly: true, permission: "MANAGE_MESSAGES",
  },
  // Oyunlar
  {
    name: "bj", aliases: ["blackjack"], group: "games", label: "Blackjack", args: [a("bahis")],
    description: "Kasaya karşı blackjack eli başlat", usage: [["/bj 100", ""]], keywords: ["kart", "21"],
    insert: "/bj 100", casino: true,
  },
  {
    name: "slot", group: "games", label: "Slot", args: [a("bahis")],
    description: "Beş makaralı slotu çevir", usage: [["/slot 100", ""]], keywords: ["makara", "çevir"],
    insert: "/slot 100", casino: true,
  },
  {
    name: "coinflip", aliases: ["cf"], group: "games", label: "Yazı tura", args: [a("bahis"), a("yazı|tura", true)],
    description: "Yazı tura at, kazanırsan bahsin 2× döner", usage: [["/coinflip 100 yazı", ""]], keywords: ["yazı", "tura", "para"],
    insert: "/coinflip 100", casino: true,
  },
  // Kredi
  {
    name: "pay", aliases: ["gonder", "send", "tip"], group: "credits", label: "Gönder", args: [a("@kullanıcı"), a("miktar")],
    description: "Birine DesCoin gönder", usage: [["/pay @kullanıcı 500", ""]], keywords: ["gönder", "para", "descoin", "kullanıcı"],
    insert: "/pay ", userArg: true, casino: true,
  },
  {
    name: "daily", group: "credits", label: "Günlük bonus", args: [],
    description: "Günlük bonusunu al · her gün +250", usage: [["/daily", ""]], keywords: ["günlük", "bonus", "ödül"],
    insert: "/daily", casino: true,
  },
  {
    name: "credits", aliases: ["bakiye", "balance"], group: "credits", label: "Bakiye", args: [],
    description: "DesCoin bakiyeni gör", usage: [["/credits", ""]], keywords: ["bakiye", "cüzdan", "descoin"],
    insert: "/credits", casino: true,
  },
  {
    name: "top", aliases: ["lider"], group: "credits", label: "Liderlik", args: [],
    description: "Liderlik tablosu", usage: [["/top", ""]], keywords: ["sıralama", "lider"],
    insert: "/top", casino: true,
  },
];

for (const cmd of SLASH_COMMANDS) {
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
      lockReason: lock ? `“${PERMISSION_LABELS[lock] || lock}” yetkisi gerekiyor` : null,
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
 * A command matches by its name, alias, Turkish label, keyword or description.
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
 * "EN İYİ EŞLEŞME", the rest grouped by category in rank order.
 */
export function slashMenuSections(matches, { query = "", category = "all" } = {}) {
  const list = category === "all" ? matches : matches.filter((m) => m.group === category);
  if (!list.length) return [];
  if (!foldTr(query).trim()) return groupSlashMatches(list).map((g) => ({ id: g.id, label: g.label, items: g.items }));
  const [best, ...rest] = list;
  const sections = [{ id: "best", label: "En iyi eşleşme", items: [best] }];
  for (const g of SLASH_GROUPS) {
    const items = rest.filter((m) => m.group === g.id);
    if (items.length) sections.push({ id: g.id, label: g.label, items });
  }
  return sections;
}

/** Commands for the empty state ("Sık kullanılanlar"). */
export const FREQUENT_COMMANDS = ["poll", "user", "avatar", "server", "help"];

/** The first command name of a slash text ("/Yardım x" → "yardım"). */
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

/** Timeout duration chips (label → server token). */
export const TIMEOUT_DURATIONS = [
  { label: "60 sn", token: "60s", seconds: 60 },
  { label: "5 dk", token: "5m", seconds: 300 },
  { label: "10 dk", token: "10m", seconds: 600 },
  { label: "1 sa", token: "1h", seconds: 3600 },
  { label: "1 gün", token: "1d", seconds: 86400 },
  { label: "1 hafta", token: "1w", seconds: 604800 },
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
