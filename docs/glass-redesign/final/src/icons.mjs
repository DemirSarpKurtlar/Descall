// Exact Lucide icons (same set the real app imports from lucide-react).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "../tools/node_modules/lucide-static/icons");

const cache = new Map();
export function L(name, cls = "") {
  const key = name + "|" + cls;
  if (cache.has(key)) return cache.get(key);
  let svg = fs.readFileSync(path.join(DIR, `${name}.svg`), "utf8");
  svg = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
  svg = svg.replace(/class="[^"]*"/, `class="i ${cls}"`).replace(/ width="24" height="24"/, "");
  cache.set(key, svg);
  return svg;
}

const map = {
  chat: "message-square", groups: "users", servers: "server", play: "crosshair",
  friends: "user-plus", userPlus: "user-plus", activity: "zap", calls: "phone",
  plus: "plus", settings: "settings", search: "search", megaphone: "megaphone",
  feedback: "message-square-plus", link: "link-2", back: "chevron-left", chevR: "chevron-right",
  chevD: "chevron-down", arrowL: "arrow-left", mic: "mic", micOff: "mic-off",
  headphones: "headphones", headOff: "headphone-off", video: "video", videoOff: "video-off",
  monitor: "monitor", moreV: "ellipsis-vertical", moreH: "ellipsis", phoneOff: "phone-off",
  phoneIn: "phone-incoming", phoneOut: "phone-outgoing", phoneMissed: "phone-missed",
  hash: "hash", volume: "volume-2", pin: "pin", ban: "ban", smile: "smile", send: "send",
  image: "image", file: "file-text", gift: "gift", check: "check", checkCheck: "check-check", x: "x",
  clock: "clock", refresh: "refresh-cw", sliders: "sliders-horizontal", hand: "hand", flag: "flag",
  reply: "reply", trash: "trash-2", pencil: "pencil", bag: "shopping-bag", share2: "share-2", shield: "shield",
  type: "type", palette: "palette", bell: "bell", globe: "globe", user: "user", logout: "log-out",
  sparkles: "sparkles", award: "award", tag: "tag", camera: "camera", upload: "upload", copy: "copy",
  share: "share", lock: "lock", mail: "mail", eyeOff: "eye-off", userMinus: "user-minus",
  circleDot: "circle-dot", sun: "sun", wallpaper: "wallpaper", flame: "flame", users: "users",
  userCheck: "user-check", play2: "play", gamepad: "gamepad-2", music: "music", coins: "coins",
  shieldCheck: "shield-check", smartphone: "smartphone", laptop: "laptop", cal: "calendar-days",
  bellOff: "bell-off", mailOpen: "mail-open", userX: "user-x", logIn: "log-in", key: "key-round",
  appleish: "apple", info: "info", star: "star", trophy: "trophy", radio: "radio", target: "target",
  messageCircle: "message-circle", atSign: "at-sign", headset: "headset", signal: "signal",
  wifi: "wifi", door: "door-open", crown: "crown", messages: "messages-square",
};
export const I = new Proxy({}, { get: (_, k) => (map[k] ? L(map[k]) : (() => { throw new Error("icon " + String(k)); })()) });
