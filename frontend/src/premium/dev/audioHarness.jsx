/**
 * Dev-only harness for the Descall+ hotkey / audio / notification settings
 * panels (premium-audio-harness.html on the Vite dev server; not a build input).
 * The membership is mocked as Ultra; settings live in localStorage (web path).
 * Query: ?panel=NoiseGate&lang=en
 */
import { createRoot } from "react-dom/client";
import "../../styles.css";
import { LocaleProvider } from "../../context/LocaleContext";
import { configurePremiumFetch, refreshPremium } from "../premiumStore.js";
import { startPremiumAudioRuntime } from "../audio/premiumAudioRuntime.js";
import { startPremiumNotifyRuntime } from "../notify/premiumNotify.js";
import { notificationHistory } from "../notify/notificationHistory.js";
import seed from "./audioHarnessSeed.json";

const q = new URLSearchParams(window.location.search);
if (q.get("lang")) localStorage.setItem("descall_language", q.get("lang"));
document.documentElement.classList.add("glass-ui", "glass-desktop");

// ?desktop=1: a mock of the Electron bridge (settings in localStorage, canned statuses).
if (q.get("desktop") === "1" && !window.descallPremium) {
  const bindings = { toggle_mute: "CommandOrControl+Alt+M", toggle_deafen: "CommandOrControl+Alt+D", push_to_talk: "Mouse4", quick_launcher: "CommandOrControl+Shift+K", volume_up: "CommandOrControl+Alt+Up", volume_down: "CommandOrControl+Alt+Down" };
  const read = (key) => { try { return JSON.parse(localStorage.getItem(`descall:premium:${key}`) || "{}"); } catch { return {}; } };
  const status = {
    "premium:global_mute:status": { ok: true, hotkeys: { bindings, failures: [{ action: "toggle_deafen", accel: "CommandOrControl+Alt+D", reason: "taken" }] } },
    "premium:global_ptt:status": { ok: true, mode: "hold", binding: "Mouse4", nativeAvailable: true, hookRunning: false },
    "premium:hotkeys:status": { ok: true, bindings, failures: [] },
    "premium:hotkeys:check": { ok: true, issues: [{ action: "volume_up", accel: "CommandOrControl+Alt+M", reason: "duplicate", other: "toggle_mute" }] },
    "premium:media_keys:status": { ok: true, inCall: false, active: [], failed: [] },
    "premium:quick_reply:status": { ok: true, mode: "native", reason: null },
  };
  window.descallPremium = {
    invoke: async (channel, ...args) => {
      if (channel === "premium:settings:get") return { ok: true, settings: read(args[0]) };
      if (channel === "premium:settings:set") {
        const next = { ...read(args[0]), ...(args[1] || {}) };
        localStorage.setItem(`descall:premium:${args[0]}`, JSON.stringify(next));
        return { ok: true, settings: next };
      }
      return status[channel] || { ok: true };
    },
    on: () => () => {},
  };
}

configurePremiumFetch(async () => ({ plan: "ultra", status: "active" }));
refreshPremium({ signedIn: true });
startPremiumAudioRuntime();
startPremiumNotifyRuntime();

// Sample data so list panels are not empty in screenshots (audioHarnessSeed.json).
if (q.get("seed") !== "0") {
  const h = notificationHistory();
  if (!h.list().length) seed.history.forEach((item) => h.add(item));
  for (const [key, value] of Object.entries(seed.settings)) {
    const k = `descall:premium:${key}`;
    if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(value));
  }
  if (!localStorage.getItem("descall:premium:focus_mode")) {
    localStorage.setItem("descall:premium:focus_mode", JSON.stringify({ until: Date.now() + 42 * 60000, allowCalls: true, allowDms: false, lastMinutes: 60 }));
  }
}

const panels = import.meta.glob("../settings/*.jsx", { eager: true });
const wanted = q.get("panel");

function Harness() {
  const list = Object.entries(panels)
    .map(([file, mod]) => ({ name: file.split("/").pop().replace(".jsx", ""), mod }))
    .filter((p) => !wanted || p.name === wanted);
  return (
    <div className="user-settings is-desktop" style={{ position: "static", padding: 24, maxWidth: 760, margin: "0 auto", minHeight: "100vh" }}>
      {list.map(({ name, mod }) => {
        const Panel = mod.Panel;
        return (
          <div key={name} data-panel={name} className="us-tab" style={{ marginBottom: 28 }}>
            <Panel />
          </div>
        );
      })}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <LocaleProvider>
    <Harness />
  </LocaleProvider>
);
