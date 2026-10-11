// Exact Lucide icons (same set the real app imports from lucide-react).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "../../final/tools/node_modules/lucide-static/icons");
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
  chat: "message-square", groups: "users", servers: "server", play: "crosshair", friends: "user-plus", activity: "zap", calls: "phone",
  plus: "plus", settings: "settings", settings2: "settings-2", search: "search", megaphone: "megaphone", feedback: "message-square-plus", link: "link-2",
  back: "chevron-left", chevR: "chevron-right", chevD: "chevron-down", chevU: "chevron-up", arrowL: "arrow-left", mic: "mic", micOff: "mic-off",
  headphones: "headphones", headOff: "headphone-off", video: "video", videoOff: "video-off", monitor: "monitor", monitorOff: "monitor-off",
  moreV: "ellipsis-vertical", moreH: "ellipsis", phoneOff: "phone-off", phoneIn: "phone-incoming", phoneOut: "phone-outgoing", phoneMissed: "phone-missed",
  hash: "hash", volume: "volume-2", pin: "pin", pinOff: "pin-off", ban: "ban", smile: "smile", send: "send", image: "image", file: "file-text", gift: "gift",
  check: "check", checkCheck: "check-check", x: "x", clock: "clock", refresh: "refresh-cw", sliders: "sliders-horizontal", hand: "hand", flag: "flag",
  reply: "reply", trash: "trash-2", pencil: "pencil", bag: "shopping-bag", shield: "shield", type: "type", palette: "palette", bell: "bell", bellOff: "bell-off",
  bellRing: "bell-ring", globe: "globe", user: "user", logout: "log-out", login: "log-in", sparkles: "sparkles", award: "award", tag: "tag", camera: "camera",
  upload: "upload", copy: "copy", lock: "lock", mail: "mail", mailOpen: "mail-open", eye: "eye", eyeOff: "eye-off", userMinus: "user-minus", circleDot: "circle-dot",
  sun: "sun", moon: "moon", wallpaper: "wallpaper", flame: "flame", users: "users", userCheck: "user-check", gamepad: "gamepad-2", coins: "coins",
  crown: "crown", folder: "folder", grip: "grip-vertical", scroll: "scroll-text", radio: "radio", minus: "minus", square: "square", info: "info",
  alert: "triangle-alert", circleSlash: "circle-slash", checkCircle: "circle-check", xCircle: "circle-x", filter: "filter", gamepad2: "gamepad-2",
  edit3: "pen-line", messageCircle: "message-circle", ellipsis: "ellipsis", users2: "users-round", userRoundPlus: "user-round-plus", maximize: "maximize-2",
  share2: "share-2", play2: "play", star: "star", loader: "loader-circle", keyboard: "keyboard", volumeX: "volume-x", arrowRight: "arrow-right",
  lockKeyhole: "lock-keyhole", rotate: "rotate-cw", smartphone: "smartphone", laptop: "laptop", trophy: "trophy", target: "target",
};
export const I = new Proxy({}, { get: (_, k) => (map[k] ? L(map[k]) : (() => { throw new Error("icon " + String(k)); })()) });
