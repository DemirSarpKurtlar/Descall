/**
 * Shared emoji catalog: the composer picker and the long-press "More reactions"
 * sheet read the same list. Search keywords are search data, not displayed text:
 * each item is "emoji keywords…" in English (the base), and KEYWORDS adds the
 * keywords of other languages by locale id and emoji. Search matches the keywords
 * of every language, so a query works whatever the UI language is.
 */
const RAW = [
  { id: "smileys", nameKey: "Smileys", icon: "😀", items: [
    "😀 smile grin", "😃 happy smile", "😄 laugh happy", "😁 grin", "😆 laugh", "😅 sweat laugh",
    "🤣 rofl laugh", "😂 joy laugh tears", "🙂 slight smile", "🙃 upside down", "😉 wink", "😊 blush smile",
    "😇 angel halo", "🥰 love hearts", "😍 heart eyes love", "🤩 star struck", "😘 kiss", "😗 kiss",
    "😚 kiss closed", "😙 kiss smile", "😋 yum tasty", "😛 tongue", "😜 wink tongue", "🤪 crazy zany",
    "😝 tongue squint", "🤑 money", "🤗 hug", "🤭 oops giggle", "🤫 shush quiet", "🤔 think hmm",
    "🤐 zip", "🤨 raised eyebrow", "😐 neutral", "😑 expressionless", "😶 no mouth", "😏 smirk",
    "😒 unamused", "🙄 eye roll", "😬 grimace", "😌 relieved", "😔 pensive sad", "😪 sleepy",
    "🤤 drool", "😴 sleep", "😷 mask sick", "🤒 fever sick", "🤕 hurt", "🤢 nausea",
    "🤮 vomit", "🤧 sneeze", "🥵 hot", "🥶 cold", "🥴 woozy", "😵 dizzy",
    "🤯 mind blown", "🤠 cowboy", "🥳 party", "😎 cool sunglasses", "🤓 nerd", "🧐 monocle",
    "😕 confused", "😟 worried", "🙁 frown", "☹️ frown sad", "😮 wow surprised", "😯 hushed",
    "😲 astonished", "😳 flushed", "🥺 pleading", "😦 frown", "😧 anguished", "😨 fearful",
    "😰 anxious", "😥 sad relieved", "😢 cry sad", "😭 sob cry", "😱 scream", "😖 confounded",
    "😣 persevere", "😞 disappointed", "😓 sweat", "😩 weary", "😫 tired", "🥱 yawn",
    "😤 huff triumph", "😡 angry", "😠 angry mad", "🤬 swear", "😈 devil", "👿 imp",
    "💀 skull dead", "☠️ skull crossbones", "💩 poop", "🤡 clown", "👻 ghost", "👽 alien",
    "👾 space invader game", "🤖 robot", "😺 cat smile", "😹 cat joy", "😻 cat heart", "🙀 cat weary",
    "😿 cat cry",
  ] },
  { id: "gestures", nameKey: "Gestures", icon: "👋", items: [
    "👋 wave hi", "🤚 back hand", "🖐️ hand five", "✋ raised hand stop", "🖖 vulcan", "👌 ok perfect",
    "🤌 pinched", "🤏 pinch little", "✌️ peace victory", "🤞 fingers crossed luck", "🤟 love you", "🤘 rock metal",
    "🤙 call me", "👈 left", "👉 right", "👆 up", "👇 down", "☝️ point up",
    "👍 like thumbs up yes", "👎 dislike thumbs down no", "✊ fist", "👊 punch", "🤛 fist left", "🤜 fist right",
    "👏 clap applause", "🙌 raise hands hooray", "👐 open hands", "🤲 palms", "🤝 handshake deal", "🙏 pray please thanks",
    "✍️ write", "💅 nail", "🤳 selfie", "💪 strong muscle", "🧠 brain smart", "👀 eyes look",
    "👁️ eye", "👅 tongue", "👄 mouth lips", "💋 kiss lips", "🫡 salute", "🫶 heart hands",
  ] },
  { id: "hearts", nameKey: "Hearts", icon: "❤️", items: [
    "❤️ red heart love", "🧡 orange heart", "💛 yellow heart", "💚 green heart", "💙 blue heart", "💜 purple heart",
    "🖤 black heart", "🤍 white heart", "🤎 brown heart", "💔 broken heart", "❣️ heart exclamation", "💕 two hearts",
    "💞 revolving hearts", "💓 beating heart", "💗 growing heart", "💖 sparkling heart", "💘 cupid heart arrow", "💝 gift heart",
    "💟 heart decoration", "❤️‍🔥 heart fire",
  ] },
  { id: "animals", nameKey: "Animals & Nature", icon: "🐶", items: [
    "🐶 dog", "🐱 cat", "🐭 mouse", "🐹 hamster", "🐰 rabbit", "🦊 fox",
    "🐻 bear", "🐼 panda", "🐨 koala", "🐯 tiger", "🦁 lion", "🐮 cow",
    "🐷 pig", "🐸 frog", "🐵 monkey", "🙈 see no evil monkey", "🙉 hear no evil", "🙊 speak no evil",
    "🐔 chicken", "🐧 penguin", "🐦 bird", "🦄 unicorn", "🐝 bee", "🦋 butterfly",
    "🐢 turtle", "🐍 snake", "🐙 octopus", "🐬 dolphin", "🐳 whale", "🌸 blossom flower",
    "🌹 rose", "🌻 sunflower", "🌲 tree", "🍀 clover luck", "🍁 leaf", "🌙 moon",
    "⭐ star", "🌟 glowing star", "☀️ sun", "🌈 rainbow", "⚡ lightning", "❄️ snow",
    "🔥 fire lit", "🌊 wave sea", "💧 drop",
  ] },
  { id: "food", nameKey: "Food & Drink", icon: "🍔", items: [
    "🍏 green apple", "🍎 apple", "🍊 orange", "🍋 lemon", "🍌 banana", "🍉 watermelon",
    "🍇 grapes", "🍓 strawberry", "🍒 cherry", "🍑 peach", "🥑 avocado", "🌶️ pepper hot",
    "🌽 corn", "🥐 croissant", "🍞 bread", "🧀 cheese", "🍳 egg", "🍔 burger",
    "🍟 fries", "🍕 pizza", "🌭 hot dog", "🌮 taco", "🍝 pasta", "🍜 noodles ramen",
    "🍣 sushi", "🍦 ice cream", "🍩 donut", "🍪 cookie", "🎂 birthday cake", "🍰 cake",
    "🍫 chocolate", "🍿 popcorn", "☕ coffee", "🍵 tea", "🧋 bubble tea", "🍺 beer",
    "🍻 cheers", "🥂 toast", "🍷 wine", "🥤 drink",
  ] },
  { id: "activities", nameKey: "Activities", icon: "⚽", items: [
    "⚽ soccer football", "🏀 basketball", "🏈 football", "⚾ baseball", "🎾 tennis", "🏐 volleyball",
    "🎱 pool", "🏓 ping pong", "🥊 boxing", "🏆 trophy win", "🥇 gold medal first", "🥈 silver second",
    "🥉 bronze third", "🏅 medal", "🎮 game controller", "🕹️ joystick", "🎲 dice", "♟️ chess",
    "🎯 target bullseye", "🎳 bowling", "🎸 guitar", "🎤 mic sing", "🎧 headphones", "🎵 music note",
    "🎶 music notes", "🎬 movie", "🎨 art paint", "🎉 party tada celebrate", "🎊 confetti", "🎁 gift present",
    "🎈 balloon",
  ] },
  { id: "objects", nameKey: "Objects", icon: "💡", items: [
    "💡 idea bulb", "📱 phone", "💻 laptop", "⌨️ keyboard", "🖥️ desktop", "📷 camera",
    "📞 phone call", "⏰ alarm clock", "⌛ hourglass", "💰 bag money", "💸 money fly", "💎 gem diamond",
    "🔧 wrench tool", "🔨 hammer", "⚙️ gear settings", "🔒 lock", "🔑 key", "📌 pin",
    "📎 paperclip", "✏️ pencil", "📝 memo note", "📚 books", "📦 package box", "✉️ mail envelope",
    "🔔 bell notification", "📣 megaphone", "🚀 rocket launch", "✈️ plane", "🚗 car", "🏠 house home",
    "⏳ wait hourglass",
  ] },
  { id: "symbols", nameKey: "Symbols", icon: "✅", items: [
    "✅ check done yes", "☑️ check box", "✔️ check mark", "❌ cross no", "❎ cross mark", "⭕ circle",
    "❗ exclamation", "❓ question", "‼️ double exclamation", "⁉️ interrobang", "💯 hundred 100 perfect", "🔴 red circle",
    "🟢 green circle", "🔵 blue circle", "⚠️ warning", "🚫 prohibited no", "♻️ recycle", "➕ plus",
    "➖ minus", "✨ sparkles", "💤 zzz sleep", "💬 speech chat", "💭 thought", "🆗 ok",
    "🆕 new", "🆒 cool", "🔝 top", "♾️ infinity", "🏳️‍🌈 rainbow flag", "🇹🇷 turkey flag",
  ] },
];

const KEYWORDS = {
  tr: {
    // smileys
    "😀": "gülümse", "😃": "mutlu", "😄": "gül", "😁": "sırıt", "😆": "kahkaha", "😅": "ter",
    "🤣": "yerlerde", "😂": "gözyaşı kahkaha", "🙂": "hafif", "🙃": "ters", "😉": "göz kırp", "😊": "utangaç",
    "😇": "melek", "🥰": "aşık", "😍": "kalp göz", "🤩": "yıldız", "😘": "öpücük", "😗": "öp",
    "😚": "öpücük", "😙": "öp", "😋": "lezzetli", "😛": "dil", "😜": "dil göz kırp", "🤪": "çılgın",
    "😝": "dil şaka", "🤑": "para", "🤗": "sarıl", "🤭": "elle ağız", "🤫": "sus", "🤔": "düşün",
    "🤐": "fermuar", "🤨": "şüphe", "😐": "nötr", "😑": "ifadesiz", "😶": "ağızsız", "😏": "sinsi",
    "😒": "sıkılmış", "🙄": "göz devir", "😬": "dişler", "😌": "rahat", "😔": "düşünceli", "😪": "uykulu",
    "🤤": "salya", "😴": "uyku", "😷": "maske", "🤒": "ateş", "🤕": "yaralı", "🤢": "mide",
    "🤮": "kus", "🤧": "hapşır", "🥵": "sıcak", "🥶": "soğuk", "🥴": "sersem", "😵": "baş dönmesi",
    "🤯": "beyin patla", "🤠": "kovboy", "🥳": "parti", "😎": "havalı", "🤓": "inek", "🧐": "monokl",
    "😕": "şaşkın", "😟": "endişe", "🙁": "üzgün", "☹️": "üzgün", "😮": "şaşır", "😯": "sessiz şaşkın",
    "😲": "şok", "😳": "kızar", "🥺": "yalvar", "😦": "şaşkın", "😧": "acı", "😨": "korku",
    "😰": "kaygı", "😥": "hayal kırıklığı", "😢": "ağla", "😭": "hüngür", "😱": "çığlık", "😖": "karışık",
    "😣": "sebat", "😞": "hayal kırıklığı", "😓": "ter", "😩": "yorgun", "😫": "bitkin", "🥱": "esne",
    "😤": "öfke", "😡": "kızgın", "😠": "sinirli", "🤬": "küfür", "😈": "şeytan", "👿": "öfkeli şeytan",
    "💀": "kafatası", "☠️": "korsan", "💩": "kaka", "🤡": "palyaço", "👻": "hayalet", "👽": "uzaylı",
    "👾": "oyun canavar", "😺": "kedi", "😹": "kedi gül", "😻": "kedi aşık", "🙀": "kedi şok", "😿": "kedi ağla",
    // gestures
    "👋": "merhaba el salla", "🤚": "el", "🖐️": "el beş", "✋": "dur", "🖖": "vulkan", "👌": "tamam",
    "🤌": "italyan", "🤏": "azıcık", "✌️": "zafer", "🤞": "şans", "🤟": "seviyorum", "🤙": "ara",
    "👈": "sol", "👉": "sağ", "👆": "yukarı", "👇": "aşağı", "☝️": "bir işaret", "👍": "beğen",
    "👎": "beğenme", "✊": "yumruk", "👊": "yumruk", "🤛": "sol yumruk", "🤜": "sağ yumruk", "👏": "alkış",
    "🙌": "yaşasın", "👐": "açık eller", "🤲": "dua avuç", "🤝": "tokalaş", "🙏": "lütfen teşekkür", "✍️": "yaz",
    "💅": "oje", "💪": "güç kas", "🧠": "beyin", "👀": "gözler", "👁️": "göz", "👅": "dil",
    "👄": "ağız", "💋": "öpücük", "🫡": "selam", "🫶": "kalp eller",
    // hearts
    "❤️": "kalp kırmızı aşk", "🧡": "turuncu kalp", "💛": "sarı kalp", "💚": "yeşil kalp", "💙": "mavi kalp", "💜": "mor kalp",
    "🖤": "siyah kalp", "🤍": "beyaz kalp", "🤎": "kahverengi kalp", "💔": "kırık kalp", "❣️": "ünlem kalp", "💕": "iki kalp",
    "💞": "dönen kalp", "💓": "atan kalp", "💗": "büyüyen kalp", "💖": "parlak kalp", "💘": "ok kalp", "💝": "hediye kalp",
    "💟": "kalp süs", "❤️‍🔥": "ateşli kalp",
    // animals
    "🐶": "köpek", "🐱": "kedi", "🐭": "fare", "🐰": "tavşan", "🦊": "tilki", "🐻": "ayı",
    "🐯": "kaplan", "🦁": "aslan", "🐮": "inek", "🐷": "domuz", "🐸": "kurbağa", "🐵": "maymun",
    "🙈": "görmedim", "🙉": "duymadım", "🙊": "söylemedim", "🐔": "tavuk", "🐧": "penguen", "🐦": "kuş",
    "🦄": "tek boynuz", "🐝": "arı", "🦋": "kelebek", "🐢": "kaplumbağa", "🐍": "yılan", "🐙": "ahtapot",
    "🐬": "yunus", "🐳": "balina", "🌸": "çiçek", "🌹": "gül", "🌻": "ayçiçeği", "🌲": "ağaç",
    "🍀": "yonca", "🍁": "yaprak", "🌙": "ay", "⭐": "yıldız", "🌟": "parlak yıldız", "☀️": "güneş",
    "🌈": "gökkuşağı", "⚡": "şimşek", "❄️": "kar", "🔥": "ateş", "🌊": "dalga", "💧": "damla",
    // food
    "🍏": "elma", "🍎": "elma", "🍊": "portakal", "🍋": "limon", "🍌": "muz", "🍉": "karpuz",
    "🍇": "üzüm", "🍓": "çilek", "🍒": "kiraz", "🍑": "şeftali", "🥑": "avokado", "🌶️": "biber",
    "🌽": "mısır", "🥐": "kruvasan", "🍞": "ekmek", "🧀": "peynir", "🍳": "yumurta", "🍔": "hamburger",
    "🍟": "patates", "🌭": "sosisli", "🌮": "tako", "🍝": "makarna", "🍜": "çorba", "🍣": "suşi",
    "🍦": "dondurma", "🍪": "kurabiye", "🎂": "pasta doğum günü", "🍰": "kek", "🍫": "çikolata", "🍿": "patlamış mısır",
    "☕": "kahve çay", "🍵": "çay", "🍺": "bira", "🍻": "şerefe", "🥂": "kadeh", "🍷": "şarap",
    "🥤": "içecek",
    // activities
    "⚽": "futbol", "🏀": "basketbol", "🏈": "amerikan futbolu", "⚾": "beyzbol", "🎾": "tenis", "🏐": "voleybol",
    "🎱": "bilardo", "🏓": "masa tenisi", "🥊": "boks", "🏆": "kupa", "🥇": "altın madalya", "🥈": "gümüş",
    "🥉": "bronz", "🏅": "madalya", "🎮": "oyun", "🎲": "zar", "♟️": "satranç", "🎯": "hedef",
    "🎸": "gitar", "🎤": "mikrofon", "🎧": "kulaklık", "🎵": "müzik", "🎶": "notalar", "🎬": "film",
    "🎨": "sanat", "🎉": "kutlama tebrik", "🎊": "konfeti", "🎁": "hediye", "🎈": "balon",
    // objects
    "💡": "fikir ampul", "📱": "telefon", "💻": "bilgisayar", "⌨️": "klavye", "🖥️": "masaüstü", "📷": "kamera",
    "📞": "telefon", "⏰": "alarm", "⌛": "kum saati", "💰": "para", "💸": "para uçuyor", "💎": "elmas",
    "🔧": "anahtar", "🔨": "çekiç", "⚙️": "ayar", "🔒": "kilit", "🔑": "anahtar", "📌": "iğne",
    "📎": "ataş", "✏️": "kalem", "📝": "not", "📚": "kitaplar", "📦": "paket", "✉️": "zarf",
    "🔔": "zil", "📣": "megafon", "🚀": "roket", "✈️": "uçak", "🚗": "araba", "🏠": "ev",
    "⏳": "bekle",
    // symbols
    "✅": "tamam onay", "☑️": "kutu", "✔️": "onay", "❌": "hayır çarpı", "❎": "çarpı", "⭕": "daire",
    "❗": "ünlem", "❓": "soru", "‼️": "çift ünlem", "⁉️": "ünlem soru", "💯": "yüz", "🔴": "kırmızı",
    "🟢": "yeşil", "🔵": "mavi", "⚠️": "uyarı", "🚫": "yasak", "♻️": "geri dönüşüm", "➕": "artı",
    "➖": "eksi", "✨": "parıltı", "💤": "uyku", "💬": "konuşma", "💭": "düşünce", "🆗": "tamam",
    "🆕": "yeni", "🆒": "havalı", "🔝": "en iyi", "♾️": "sonsuz", "🏳️‍🌈": "gökkuşağı bayrak", "🇹🇷": "türkiye bayrak",
  },
};

export const EMOJI_CATEGORIES = Object.freeze(RAW.map((c) => Object.freeze({
  id: c.id,
  nameKey: c.nameKey,
  icon: c.icon,
  entries: Object.freeze(c.items.map((s) => {
    const sp = s.indexOf(" ");
    const emoji = s.slice(0, sp);
    const byLocale = { en: s.slice(sp + 1) };
    for (const [loc, map] of Object.entries(KEYWORDS)) if (map[emoji]) byLocale[loc] = map[emoji];
    // `keywords`: every language joined (what search reads); `keywordsByLocale`: per language.
    return Object.freeze({
      emoji,
      keywords: Object.values(byLocale).join(" "),
      keywordsByLocale: Object.freeze(byLocale),
    });
  })),
  emojis: Object.freeze(c.items.map((s) => s.slice(0, s.indexOf(" ")))),
})));

/** Fold Turkish letters and case so "gulmek" finds "gül". */
export function foldEmojiQuery(s) {
  return String(s || "")
    .toLocaleLowerCase("tr")
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .trim();
}

/** Emojis whose keywords (or the emoji itself) match every word of the query. */
export function searchEmojis(query, categories = EMOJI_CATEGORIES) {
  const q = foldEmojiQuery(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const c of categories) {
    for (const e of c.entries) {
      if (seen.has(e.emoji)) continue;
      const hay = foldEmojiQuery(e.keywords);
      if (e.emoji === query.trim() || words.every((w) => hay.split(/\s+/).some((k) => k.startsWith(w)))) {
        seen.add(e.emoji);
        out.push(e.emoji);
      }
    }
  }
  return out;
}

const RECENT_KEY = "descall:recent-emojis:v1";
const RECENT_MAX = 24;

export function loadRecentEmojis(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji, storage = globalThis.localStorage) {
  if (!emoji) return loadRecentEmojis(storage);
  const next = [emoji, ...loadRecentEmojis(storage).filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try { storage?.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}
