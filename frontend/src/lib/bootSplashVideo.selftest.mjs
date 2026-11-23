// Boot splash size and sharpness (Nov 2026: "the start animation is far too small and blurry").
// Run from frontend/: node src/lib/bootSplashVideo.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const front = join(here, "..", "..");
const html = readFileSync(join(front, "index.html"), "utf8");

// --- WebM (Matroska / EBML): Segment > Tracks > TrackEntry > Video > PixelWidth / PixelHeight / AlphaMode.
function vint(buf, pos, keepMarker) {
  const first = buf[pos];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len += 1;
  assert.ok(len <= 8, "bad EBML vint");
  let value = keepMarker ? first : first & (0xff >> len);
  let unknown = value === (0xff >> len);
  for (let i = 1; i < len; i += 1) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) unknown = false;
  }
  return { value, len, unknown };
}
function webmVideo(buf) {
  const out = {};
  const containers = new Set([0x18538067, 0x1654ae6b, 0xae, 0xe0]);
  (function walk(start, end, inVideo) {
    let pos = start;
    while (pos < end) {
      const id = vint(buf, pos, true);
      const size = vint(buf, pos + id.len, false);
      const body = pos + id.len + size.len;
      const stop = size.unknown ? end : Math.min(end, body + size.value);
      if (containers.has(id.value)) walk(body, stop, inVideo || id.value === 0xe0);
      else if (inVideo && (id.value === 0xb0 || id.value === 0xba || id.value === 0x53c0)) {
        let v = 0;
        for (let i = body; i < stop; i += 1) v = v * 256 + buf[i];
        out[{ 0xb0: "width", 0xba: "height", 0x53c0: "alpha" }[id.value]] = v;
      } else if (id.value === 0x1f43b675) return; // first Cluster: the track header is behind us
      pos = stop;
    }
  })(0, buf.length, false);
  return out;
}

// --- MP4: moov > trak > tkhd, width / height are the last two 16.16 fields.
function mp4Size(buf) {
  let found = null;
  (function walk(start, end) {
    let pos = start;
    while (pos + 8 <= end && !found) {
      let size = buf.readUInt32BE(pos);
      const type = buf.toString("latin1", pos + 4, pos + 8);
      let head = 8;
      if (size === 1) { size = Number(buf.readBigUInt64BE(pos + 8)); head = 16; }
      if (size === 0) size = end - pos;
      if (type === "moov" || type === "trak") walk(pos + head, pos + size);
      else if (type === "tkhd") {
        const w = buf.readUInt32BE(pos + size - 8) / 65536;
        const h = buf.readUInt32BE(pos + size - 4) / 65536;
        if (w > 0 && h > 0) found = { width: w, height: h };
      }
      pos += size;
    }
  })(0, buf.length);
  return found;
}

for (const k of ["oneshot", "loop"]) {
  const webm = readFileSync(join(front, "public/brand/splash", `descall-splash-${k}.webm`));
  const v = webmVideo(webm);
  assert.ok(v.width >= 640 && v.height === v.width, `${k}.webm is a square of at least 640 px (got ${v.width}x${v.height})`);
  assert.equal(v.alpha, 1, `${k}.webm carries VP9 alpha (AlphaMode 1)`);
  assert.ok(webm.length < 256 * 1024, `${k}.webm stays under 256 KB`);
  assert.deepEqual(webm, readFileSync(join(front, "electron/splash", `descall-splash-${k}.webm`)), `${k}.webm: Electron ships the same file`);
  const mp4 = readFileSync(join(front, "public/brand/splash", `descall-splash-${k}.mp4`));
  const m = mp4Size(mp4);
  assert.ok(m && m.width >= 640 && m.height === m.width, `${k}.mp4 is a square of at least 640 px (got ${m && m.width})`);
  assert.ok(mp4.length < 256 * 1024, `${k}.mp4 stays under 256 KB`);
}

// --- Tile size: desktop 160 px (tiers 128 / 152 / 184 / 224), phone web 116 px, every
// tier's video box = tile x 600/440 in whole pixels of the same parity (centred on the grid).
const desktop = /html:not\(\.boot-mobile\) #boot-splash \{\s*--boot-tile: (\d+)px;/.exec(html);
assert.ok(desktop && Number(desktop[1]) >= 152 && Number(desktop[1]) <= 168, "desktop splash tile is 152-168 px");
const phone = /html\.boot-mobile:not\(\.native-app\) \.descall-boot-splash \{\s*--boot-tile: (\d+)px;\s*--boot-anim: (\d+)px;/.exec(html);
assert.ok(phone && Number(phone[1]) >= 112 && Number(phone[1]) <= 120, "phone web splash tile is 112-120 px");
const tiers = [...html.matchAll(/--boot-tile: (\d+)px;[^}]*?--boot-anim: (\d+)px;/g)].map((m) => [Number(m[1]), Number(m[2])]);
assert.ok(tiers.length >= 5, "desktop tiers + phone define tile and video box");
for (const [tile, anim] of tiers) {
  assert.ok(Math.abs(anim - (tile * 600) / 440) <= 1.5, `video box ${anim} matches tile ${tile}`);
  assert.equal((anim - tile) % 2, 0, `tile ${tile} / video ${anim}: same parity, whole-pixel offset`);
}
assert.match(html, /html:not\(\.boot-mobile\) #boot-splash \.boot-mark:has\(\.boot-symbol\) \{[^}]*width: var\(--boot-tile\);[^}]*height: var\(--boot-tile\);/, "glass tile uses the tile size");
assert.match(html, /html:not\(\.native-app\) #boot-splash \.boot-mark--anim \.boot-anim \{[^}]*left: calc\(\(var\(--boot-tile\) - var\(--boot-anim\)\) \/ 2\);[^}]*transform: none;/, "video box placed on whole pixels, no translate(-50%)");
assert.match(html, /\.boot-mark--mp4 \.boot-anim \{ clip-path: inset\(13\.4% round 16\.5%\); \}/, "MP4 clip matches the 600 px crop (tile 73.3%)");

// --- Sharp at rest: no transform left on the card or the wordmark once the entry animation ends.
assert.doesNotMatch(html, /translateY\(-10px\) scale\(1\)/, "entry animation does not end on a transform");
assert.match(html, /@keyframes boot-card-in \{\s*from \{ opacity: 0; transform: scale\(0\.96\); \}\s*to \{ opacity: 1; transform: none; \}/);
assert.match(html, /html:not\(\.boot-mobile\) #boot-splash \.boot-card \{\s*top: -10px;[^}]*transform: none;[^}]*boot-card-in [^;]* backwards;/, "card lift is a layout offset, animation fills backwards only");
assert.match(html, /html:not\(\.boot-mobile\) #boot-splash \.boot-wordmark \{[^}]*boot-card-in [^;]* backwards;/, "wordmark animation fills backwards only");
assert.match(html, /<img class="boot-symbol" src="\/brand\/descall-symbol-gradient\.svg"/, "static fallback tile draws the SVG symbol");

console.log("bootSplashVideo.selftest.mjs: ok");
