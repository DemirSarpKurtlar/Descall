/* Small shared controls and defaults for the gaming / productivity panels. */
import "./gaming.css";
import { useT } from "../../context/LocaleContext";

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

export function Switch({ checked, onChange, label, disabled, testId }) {
  return (
    <label className="pg-switch">
      <input type="checkbox" role="switch" checked={Boolean(checked)} disabled={disabled} data-testid={testId} onChange={(e) => onChange?.(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Field({ label, children }) {
  return (
    <label className="pg-row">
      <span className="pg-label pg-grow">{label}</span>
      {children}
    </label>
  );
}

export function PanelShell({ title, desc, children, testId }) {
  return (
    <section className="pg-panel" data-testid={testId}>
      <h3>{title}</h3>
      {desc ? <p className="pg-desc">{desc}</p> : null}
      {children}
    </section>
  );
}

/** Corner + size + opacity controls shared by both HUDs. */
export function OverlayPlacement({ value, onChange }) {
  const t = useT();
  return (
    <div className="pg-card">
      <Field label={t("premiumGaming.common.position")}>
        <select className="pg-select" value={value.corner} onChange={(e) => onChange({ corner: e.target.value })}>
          <option value="tl">{t("premiumGaming.common.corner.tl")}</option>
          <option value="tr">{t("premiumGaming.common.corner.tr")}</option>
          <option value="bl">{t("premiumGaming.common.corner.bl")}</option>
          <option value="br">{t("premiumGaming.common.corner.br")}</option>
        </select>
      </Field>
      <Field label={t("premiumGaming.common.size")}>
        <select className="pg-select" value={String(value.scale)} onChange={(e) => onChange({ scale: Number(e.target.value) })}>
          <option value="0.85">{t("premiumGaming.common.small")}</option>
          <option value="1">{t("premiumGaming.common.medium")}</option>
          <option value="1.25">{t("premiumGaming.common.large")}</option>
        </select>
      </Field>
      <Field label={t("premiumGaming.common.opacity")}>
        <input className="pg-range" type="range" min="0.3" max="1" step="0.05" value={value.opacity} onChange={(e) => onChange({ opacity: Number(e.target.value) })} />
        <span className="pg-num pg-muted">{Math.round(value.opacity * 100)}%</span>
      </Field>
      <Field label={t("premiumGaming.common.margin")}>
        <input className="pg-range" type="range" min="0" max="200" step="4" value={value.margin} onChange={(e) => onChange({ margin: Number(e.target.value) })} />
        <span className="pg-num pg-muted">{value.margin}px</span>
      </Field>
    </div>
  );
}

export function DesktopOnly() {
  const t = useT();
  return <p className="pg-help">{t("premiumGaming.common.desktopOnly")}</p>;
}

/** "1 h 5 min" / "12 min" / "40 s". */
export function formatDuration(t, sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return t("premiumGaming.common.durationHM", { h, m });
  if (m) return t("premiumGaming.common.durationM", { m });
  return t("premiumGaming.common.durationS", { s });
}

export function HotkeyInput({ value, onChange }) {
  const t = useT();
  const onKeyDown = (e) => {
    e.preventDefault();
    if (e.key === "Escape" || e.key === "Backspace") { onChange(""); return; }
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (!parts.length) return;
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!/^([A-Z0-9]|F\d{1,2})$/.test(k)) return;
    onChange([...parts, k].join("+"));
  };
  const shown = value ? value.replace("CommandOrControl", "Ctrl") : t("premiumGaming.common.none");
  return <input className="pg-input" readOnly value={shown} onKeyDown={onKeyDown} aria-label={t("premiumGaming.common.hotkey")} style={{ width: 170 }} />;
}
