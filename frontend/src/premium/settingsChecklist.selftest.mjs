/**
 * Settings checklist (settingsChecklist.js) against the code: every Descall+ feature is
 * listed, every listed setting is still named in its panel (settings/<key>.jsx, plus the
 * story parts it uses), every panel marks its settings with data-s, and the 20 features of
 * the two drafted categories keep every setting of the approved draft's checklist
 * (docs/design/premium-settings/category-drafts/checklist.json), apart from the ones the
 * product removed since (see RENAMED / DROPPED below). The DOM check runs in
 * docs/design/premium-settings/implemented-e/capture-e.cjs (CHECK=1).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_KEYS } from "./features.js";
import { SETTINGS_CHECKLIST, allItems, requiredItems } from "./settingsChecklist.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, rel), "utf8");

assert.deepEqual(Object.keys(SETTINGS_CHECKLIST).sort(), [...FEATURE_KEYS].sort(), "checklist and FEATURE_KEYS differ");

const card = src("story/StoryCategory.jsx");
assert.match(card, /data-s=\{`\$\{fkey\}\.enabled`\}/, "the card switch must carry data-s=<key>.enabled");

let items = 0;
for (const key of FEATURE_KEYS) {
  const list = SETTINGS_CHECKLIST[key];
  assert.equal(list[0], "enabled", `${key}: first item is the card switch`);
  assert.equal(new Set(list).size, list.length, `${key}: duplicate item`);
  let code = src(`settings/${key}.jsx`);
  // Parts a panel delegates to (HUD placement) count as its code.
  for (const m of code.matchAll(/from "\.\.\/story\/(HudPlacement)\.jsx"/g)) code += src(`story/${m[1]}.jsx`);
  assert.match(code, /data-s=|\bds[=(:]|ds: ds\(/, `${key}: panel marks no setting with data-s`);
  for (const raw of list.slice(1)) {
    const item = raw.replace(/^\?/, "");
    const named = new RegExp(`["'\`]${item}["'\`]|\\b${item}:|ds\\("${item}"\\)|\\$\\{key\\}\\.${item}\\b`).test(code);
    assert.ok(named, `${key}.${item} is not named in settings/${key}.jsx`);
    items += 1;
  }
  assert.ok(requiredItems(key).length >= 1);
  assert.equal(allItems(key).length, list.length);
}

// The approved draft's checklist (windows + audio) is still covered.
const draftPath = join(here, "../../../docs/design/premium-settings/category-drafts/checklist.json");
if (existsSync(draftPath)) {
  const draft = JSON.parse(readFileSync(draftPath, "utf8"));
  // Draft item -> today's item (same setting, other name).
  const RENAMED = {
    "noise_gate.thresholdDb": "noise_gate.threshold",
    "noise_gate.hysteresisDb": "noise_gate.hysteresis",
    "noise_gate.holdMs": "noise_gate.hold",
    "auto_device_switch.move": "auto_device_switch.?move",
    "auto_device_switch.remove": "auto_device_switch.?remove",
    "auto_device_switch.add": "auto_device_switch.?add",
    "stream_audio_control.note": "stream_audio_control.note",
    "voice_activity_monitor.hint": "voice_activity_monitor.hint",
    "mic_presets.apply": "mic_presets.?apply",
    "mic_presets.delete": "mic_presets.?delete",
    "audio_device_profiles.apply": "audio_device_profiles.?apply",
    "audio_device_profiles.delete": "audio_device_profiles.?delete",
    "window_layouts.apply": "window_layouts.?apply",
    "window_layouts.delete": "window_layouts.?delete",
    "custom_layouts.apply": "custom_layouts.?apply",
    "custom_layouts.remove": "custom_layouts.?remove",
    "custom_layouts.active": "custom_layouts.?active",
    "screen_edge_actions.needsSidebar": "screen_edge_actions.?needsSidebar",
  };
  // Removed by the product before this page (#378: mini mode became the in-app floating call
  // card, so its "open" button, its "open on minimise" switch and the mini window kind of
  // always on top / opacity are gone; its panel now picks the dock spot instead).
  const DROPPED = new Set(["mini_mode.open", "mini_mode.autoOnMinimize", "always_on_top.mini", "window_opacity.mini"]);
  for (const cat of ["windows", "audio"]) {
    for (const [key, list] of Object.entries(draft[cat])) {
      for (const item of list) {
        const id = `${key}.${item}`;
        if (DROPPED.has(id)) continue;
        const want = RENAMED[id] || id;
        const [k, ...rest] = want.split(".");
        const it = rest.join(".");
        assert.ok(SETTINGS_CHECKLIST[k].includes(it) || SETTINGS_CHECKLIST[k].includes(`?${it}`), `draft setting ${id} is missing (looked for ${want})`);
      }
    }
  }
}

console.log(`settingsChecklist.selftest ok: ${FEATURE_KEYS.length} features, ${items} settings + ${FEATURE_KEYS.length} switches`);
