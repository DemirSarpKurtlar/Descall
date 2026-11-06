/* Defaults and helpers shared by the gaming / productivity panels. Their controls are the
   E-style kit (../story/kit.jsx); the old Switch / Field / PanelShell / OverlayPlacement /
   HotkeyInput were replaced by it (OverlayPlacement -> ../story/HudPlacement.jsx). */
import "./gaming.css";

export const DEFAULTS = Object.freeze({
  voice_hud: { on: false, corner: "tl", scale: 1, opacity: 0.92, margin: 16 },
  gaming_hud: { on: false, corner: "tr", scale: 1, opacity: 0.92, margin: 16, showClock: true, showPing: true, showCall: true, showFriends: true },
  instant_clip: { on: false, sourceId: "", sourceName: "", windowSec: 30, hotkey: "CommandOrControl+Shift+F9" },
  clipboard_history: { on: false },
  quick_file_drop: { on: false },
  quick_actions: { items: [] },
  workspace_profiles: { active: "", profiles: [] },
  desktop_automations: { on: false, rules: [] },
  command_center: { hotkey: "CommandOrControl+Shift+K" },
  widgets: { on: false, widgets: [] },
});

/** "1 h 5 min" / "12 min" / "40 s". */
export function formatDuration(t, sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return t("premiumGaming.common.durationHM", { h, m });
  if (m) return t("premiumGaming.common.durationM", { m });
  return t("premiumGaming.common.durationS", { s });
}
