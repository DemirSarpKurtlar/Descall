/**
 * Shared emoji catalog: the composer picker and the long-press "More reactions"
 * sheet read the same list. Each entry is "emoji keywords…" (Turkish + English),
 * so search works in both languages without a big dataset.
 */
const RAW = [
  { id: "smileys", nameKey: "Smileys", icon: "😀", items: [
    "😀 gülümse smile grin", "😃 mutlu happy smile", "😄 gül laugh happy", "😁 sırıt grin", "😆 kahkaha laugh", "😅 ter sweat laugh",
    "🤣 yerlerde rofl laugh", "😂 gözyaşı kahkaha joy laugh tears", "🙂 hafif slight smile", "🙃 ters upside down", "😉 göz kırp wink",
    "😊 utangaç blush smile", "😇 melek angel halo", "🥰 aşık love hearts", "😍 kalp göz heart eyes love", "🤩 yıldız star struck",
    "😘 öpücük kiss", "😗 öp kiss", "😚 öpücük kiss closed", "😙 öp kiss smile", "😋 lezzetli yum tasty", "😛 dil tongue",
    "😜 dil göz kırp wink tongue", "🤪 çılgın crazy zany", "😝 dil şaka tongue squint", "🤑 para money", "🤗 sarıl hug",
    "🤭 elle ağız oops giggle", "🤫 sus shush quiet", "🤔 düşün think hmm", "🤐 fermuar zip", "🤨 şüphe raised eyebrow",
    "😐 nötr neutral", "😑 ifadesiz expressionless", "😶 ağızsız no mouth", "😏 sinsi smirk", "😒 sıkılmış unamused",
    "🙄 göz devir eye roll", "😬 dişler grimace", "😌 rahat relieved", "😔 düşünceli pensive sad", "😪 uykulu sleepy",
    "🤤 salya drool", "😴 uyku sleep", "😷 maske mask sick", "🤒 ateş fever sick", "🤕 yaralı hurt", "🤢 mide nausea",
    "🤮 kus vomit", "🤧 hapşır sneeze", "🥵 sıcak hot", "🥶 soğuk cold", "🥴 sersem woozy", "😵 baş dönmesi dizzy",
    "🤯 beyin patla mind blown", "🤠 kovboy cowboy", "🥳 parti party", "😎 havalı cool sunglasses", "🤓 inek nerd",
    "🧐 monokl monocle", "😕 şaşkın confused", "😟 endişe worried", "🙁 üzgün frown", "☹️ üzgün frown sad", "😮 şaşır wow surprised",
    "😯 sessiz şaşkın hushed", "😲 şok astonished", "😳 kızar flushed", "🥺 yalvar pleading", "😦 şaşkın frown", "😧 acı anguished",
    "😨 korku fearful", "😰 kaygı anxious", "😥 hayal kırıklığı sad relieved", "😢 ağla cry sad", "😭 hüngür sob cry",
    "😱 çığlık scream", "😖 karışık confounded", "😣 sebat persevere", "😞 hayal kırıklığı disappointed", "😓 ter sweat",
    "😩 yorgun weary", "😫 bitkin tired", "🥱 esne yawn", "😤 öfke huff triumph", "😡 kızgın angry", "😠 sinirli angry mad",
    "🤬 küfür swear", "😈 şeytan devil", "👿 öfkeli şeytan imp", "💀 kafatası skull dead", "☠️ korsan skull crossbones",
    "💩 kaka poop", "🤡 palyaço clown", "👻 hayalet ghost", "👽 uzaylı alien", "👾 oyun canavar space invader game",
    "🤖 robot robot", "😺 kedi cat smile", "😹 kedi gül cat joy", "😻 kedi aşık cat heart", "🙀 kedi şok cat weary", "😿 kedi ağla cat cry",
  ] },
  { id: "gestures", nameKey: "Gestures", icon: "👋", items: [
    "👋 merhaba el salla wave hi", "🤚 el back hand", "🖐️ el beş hand five", "✋ dur raised hand stop", "🖖 vulkan vulcan",
    "👌 tamam ok perfect", "🤌 italyan pinched", "🤏 azıcık pinch little", "✌️ zafer peace victory", "🤞 şans fingers crossed luck",
    "🤟 seviyorum love you", "🤘 rock metal", "🤙 ara call me", "👈 sol left", "👉 sağ right", "👆 yukarı up", "👇 aşağı down",
    "☝️ bir işaret point up", "👍 beğen like thumbs up yes", "👎 beğenme dislike thumbs down no", "✊ yumruk fist", "👊 yumruk punch",
    "🤛 sol yumruk fist left", "🤜 sağ yumruk fist right", "👏 alkış clap applause", "🙌 yaşasın raise hands hooray", "👐 açık eller open hands",
    "🤲 dua avuç palms", "🤝 tokalaş handshake deal", "🙏 lütfen teşekkür pray please thanks", "✍️ yaz write", "💅 oje nail",
    "🤳 selfie selfie", "💪 güç kas strong muscle", "🧠 beyin brain smart", "👀 gözler eyes look", "👁️ göz eye", "👅 dil tongue",
    "👄 ağız mouth lips", "💋 öpücük kiss lips", "🫡 selam salute", "🫶 kalp eller heart hands",
  ] },
  { id: "hearts", nameKey: "Hearts", icon: "❤️", items: [
    "❤️ kalp kırmızı aşk red heart love", "🧡 turuncu kalp orange heart", "💛 sarı kalp yellow heart", "💚 yeşil kalp green heart",
    "💙 mavi kalp blue heart", "💜 mor kalp purple heart", "🖤 siyah kalp black heart", "🤍 beyaz kalp white heart",
    "🤎 kahverengi kalp brown heart", "💔 kırık kalp broken heart", "❣️ ünlem kalp heart exclamation", "💕 iki kalp two hearts",
    "💞 dönen kalp revolving hearts", "💓 atan kalp beating heart", "💗 büyüyen kalp growing heart", "💖 parlak kalp sparkling heart",
    "💘 ok kalp cupid heart arrow", "💝 hediye kalp gift heart", "💟 kalp süs heart decoration", "❤️‍🔥 ateşli kalp heart fire",
  ] },
  { id: "animals", nameKey: "Animals & Nature", icon: "🐶", items: [
    "🐶 köpek dog", "🐱 kedi cat", "🐭 fare mouse", "🐹 hamster hamster", "🐰 tavşan rabbit", "🦊 tilki fox", "🐻 ayı bear",
    "🐼 panda panda", "🐨 koala koala", "🐯 kaplan tiger", "🦁 aslan lion", "🐮 inek cow", "🐷 domuz pig", "🐸 kurbağa frog",
    "🐵 maymun monkey", "🙈 görmedim see no evil monkey", "🙉 duymadım hear no evil", "🙊 söylemedim speak no evil", "🐔 tavuk chicken",
    "🐧 penguen penguin", "🐦 kuş bird", "🦄 tek boynuz unicorn", "🐝 arı bee", "🦋 kelebek butterfly", "🐢 kaplumbağa turtle",
    "🐍 yılan snake", "🐙 ahtapot octopus", "🐬 yunus dolphin", "🐳 balina whale", "🌸 çiçek blossom flower", "🌹 gül rose",
    "🌻 ayçiçeği sunflower", "🌲 ağaç tree", "🍀 yonca clover luck", "🍁 yaprak leaf", "🌙 ay moon", "⭐ yıldız star",
    "🌟 parlak yıldız glowing star", "☀️ güneş sun", "🌈 gökkuşağı rainbow", "⚡ şimşek lightning", "❄️ kar snow", "🔥 ateş fire lit",
    "🌊 dalga wave sea", "💧 damla drop",
  ] },
  { id: "food", nameKey: "Food & Drink", icon: "🍔", items: [
    "🍏 elma green apple", "🍎 elma apple", "🍊 portakal orange", "🍋 limon lemon", "🍌 muz banana", "🍉 karpuz watermelon",
    "🍇 üzüm grapes", "🍓 çilek strawberry", "🍒 kiraz cherry", "🍑 şeftali peach", "🥑 avokado avocado", "🌶️ biber pepper hot",
    "🌽 mısır corn", "🥐 kruvasan croissant", "🍞 ekmek bread", "🧀 peynir cheese", "🍳 yumurta egg", "🍔 hamburger burger",
    "🍟 patates fries", "🍕 pizza pizza", "🌭 sosisli hot dog", "🌮 tako taco", "🍝 makarna pasta", "🍜 çorba noodles ramen",
    "🍣 suşi sushi", "🍦 dondurma ice cream", "🍩 donut donut", "🍪 kurabiye cookie", "🎂 pasta doğum günü birthday cake",
    "🍰 kek cake", "🍫 çikolata chocolate", "🍿 patlamış mısır popcorn", "☕ kahve çay coffee", "🍵 çay tea", "🧋 bubble tea",
    "🍺 bira beer", "🍻 şerefe cheers", "🥂 kadeh toast", "🍷 şarap wine", "🥤 içecek drink",
  ] },
  { id: "activities", nameKey: "Activities", icon: "⚽", items: [
    "⚽ futbol soccer football", "🏀 basketbol basketball", "🏈 amerikan futbolu football", "⚾ beyzbol baseball", "🎾 tenis tennis",
    "🏐 voleybol volleyball", "🎱 bilardo pool", "🏓 masa tenisi ping pong", "🥊 boks boxing", "🏆 kupa trophy win",
    "🥇 altın madalya gold medal first", "🥈 gümüş silver second", "🥉 bronz bronze third", "🏅 madalya medal", "🎮 oyun game controller",
    "🕹️ joystick joystick", "🎲 zar dice", "♟️ satranç chess", "🎯 hedef target bullseye", "🎳 bowling bowling", "🎸 gitar guitar",
    "🎤 mikrofon mic sing", "🎧 kulaklık headphones", "🎵 müzik music note", "🎶 notalar music notes", "🎬 film movie",
    "🎨 sanat art paint", "🎉 kutlama tebrik party tada celebrate", "🎊 konfeti confetti", "🎁 hediye gift present", "🎈 balon balloon",
  ] },
  { id: "objects", nameKey: "Objects", icon: "💡", items: [
    "💡 fikir ampul idea bulb", "📱 telefon phone", "💻 bilgisayar laptop", "⌨️ klavye keyboard", "🖥️ masaüstü desktop", "📷 kamera camera",
    "📞 telefon phone call", "⏰ alarm alarm clock", "⌛ kum saati hourglass", "💰 para bag money", "💸 para uçuyor money fly",
    "💎 elmas gem diamond", "🔧 anahtar wrench tool", "🔨 çekiç hammer", "⚙️ ayar gear settings", "🔒 kilit lock", "🔑 anahtar key",
    "📌 iğne pin", "📎 ataş paperclip", "✏️ kalem pencil", "📝 not memo note", "📚 kitaplar books", "📦 paket package box",
    "✉️ zarf mail envelope", "🔔 zil bell notification", "📣 megafon megaphone", "🚀 roket rocket launch", "✈️ uçak plane",
    "🚗 araba car", "🏠 ev house home", "⏳ bekle wait hourglass",
  ] },
  { id: "symbols", nameKey: "Symbols", icon: "✅", items: [
    "✅ tamam onay check done yes", "☑️ kutu check box", "✔️ onay check mark", "❌ hayır çarpı cross no", "❎ çarpı cross mark",
    "⭕ daire circle", "❗ ünlem exclamation", "❓ soru question", "‼️ çift ünlem double exclamation", "⁉️ ünlem soru interrobang",
    "💯 yüz hundred 100 perfect", "🔴 kırmızı red circle", "🟢 yeşil green circle", "🔵 mavi blue circle", "⚠️ uyarı warning",
    "🚫 yasak prohibited no", "♻️ geri dönüşüm recycle", "➕ artı plus", "➖ eksi minus", "✨ parıltı sparkles", "💤 uyku zzz sleep",
    "💬 konuşma speech chat", "💭 düşünce thought", "🆗 tamam ok", "🆕 yeni new", "🆒 havalı cool", "🔝 en iyi top", "♾️ sonsuz infinity",
    "🏳️‍🌈 gökkuşağı bayrak rainbow flag", "🇹🇷 türkiye bayrak turkey flag",
  ] },
];

export const EMOJI_CATEGORIES = Object.freeze(RAW.map((c) => Object.freeze({
  id: c.id,
  nameKey: c.nameKey,
  icon: c.icon,
  entries: Object.freeze(c.items.map((s) => {
    const sp = s.indexOf(" ");
    return Object.freeze({ emoji: s.slice(0, sp), keywords: s.slice(sp + 1) });
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
