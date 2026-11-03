/**
 * Screen share V1 "Kutucuk satırı" (owner pick, Nov 2026).
 * Run: node frontend/src/styles/screenShareV1.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const overlay = read("src/components/CallOverlay.jsx");
const css = read("src/styles/screen-share-v1.css");
const styles = read("src/styles.css");
const layout = overlay.slice(overlay.indexOf("function ScreenShareLayout"), overlay.indexOf("function CircleBtn"));

assert.ok(styles.includes("@import './styles/screen-share-v1.css';"), "V1 stylesheet is imported");

// Layout: one stream stage, pills, tile row; the old mosaic / floating strip are gone.
assert.ok(layout.includes('className="ss-stream"'), "stream stage");
assert.ok(layout.includes('className="ss-tile-row call-screen-share-strip"'), "glass tile row");
assert.ok(!layout.includes("gd-group-mosaic"), "no mosaic branch while sharing");
assert.ok(!layout.includes("small={!mosaic}"), "no tiny floating avatars");
assert.ok(layout.includes("shareRow"), "tiles render in share-row mode");

// Pills: live, viewers, sharer, volume, fullscreen.
for (const key of ['t("Live")', "callui.share.viewers", "callui.share.sharing", "callui.share.you", "callui.share.fullscreen", "GlassVolumeSlider"]) {
  assert.ok(layout.includes(key), `stream pill ${key}`);
}

// Existing functions kept: click to enlarge, pin + multiple streams, grid, volume per sharer.
assert.ok(layout.includes("onClick={() => setScreenExpanded((v) => !v)}"), "click to enlarge");
assert.ok(layout.includes("onTogglePin"), "pin kept");
assert.ok(layout.includes("multiShare ? (") && layout.includes("<ShareFilmstrip"), "filmstrip for 2+ streams");
assert.ok(layout.includes("share-stage-grid"), "grid of streams kept");
assert.ok(layout.includes("onScreenVolumeForSharer?.(activeSharer.id, value)"), "per-sharer volume");
assert.ok(layout.includes('if (!ids.length && shareLayout !== "stage") setShareLayout("stage")'), "stage reset kept");

// Tile: badges attached to the name, separate speaking ring.
const tile = overlay.slice(overlay.indexOf("function ParticipantTile"), overlay.indexOf("function localTileMirror"));
assert.ok(tile.includes('className="ss-tile-identity"') && tile.includes('className="ss-tile-badges"'), "badges sit with the name");
assert.ok(tile.includes("!small && !shareRow && (muted || deafened") || tile.includes("small && !shareRow && (muted || deafened"), "no floating status cluster");
assert.ok(css.includes(".ss-tile.is-speaking .participant-tile-avatar-core::after"), "blue speaking ring");
assert.ok(css.includes("#4F7CFF"), "logo blue");

// One capsule: End moves inside while sharing.
assert.ok(overlay.includes('${anyScreenShare ? " is-sharing" : ""}'), "bar knows it is a share");
const bar = css.slice(css.indexOf(".call-control-bar.is-sharing {"));
assert.ok(/width: fit-content/.test(bar.slice(0, bar.indexOf("}"))) && !bar.slice(0, bar.indexOf("}")).includes("translateX"), "one centred capsule, no translateX");

// Heavy frost, never see-through, with fallbacks.
assert.ok(/--ss-glass: rgba\(30, 31, 34, 0\.9\d\)/.test(css), "dark glass >= 0.9 opaque");
assert.ok(/--ss-glass: rgba\(255, 255, 255, 0\.9\d\)/.test(css), "light glass >= 0.9 opaque");
assert.ok(css.includes("prefers-reduced-transparency: reduce"), "Reduce Transparency fallback");
assert.ok(css.includes("html.a11y-solid") && css.includes("html.gd-lite"), "solid / lite modes");
assert.ok(css.includes("prefers-reduced-motion: reduce"), "reduced motion");

// Copy in every live language, Turkish uses "sen".
const tr = read("src/i18n/locales/callui.tr.js");
assert.ok(tr.includes('you: "Ekranını paylaşıyorsun"'), "Turkish sen copy");
for (const id of ["de", "es", "fr", "pt-BR", "ru"]) {
  const src = read(`src/i18n/locales/${id}.js`);
  assert.ok(/"share": \{\s*"viewers"/.test(src), `${id} has callui.share`);
}
console.log("screenShareV1.selftest: ok");
