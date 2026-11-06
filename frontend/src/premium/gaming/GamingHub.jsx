/* Gaming and productivity hub: the settings panels of this group in one window. The
   Descall+ settings page renders the same panels (src/premium/settings/*.jsx). */
import { lazy, Suspense, useMemo, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { usePremium } from "../usePremium.js";
import { FEATURES } from "../features.js";
import { X } from "../../components/ui/Icon.jsx";
import { createPortal } from "react-dom";
import "./gaming.css";

export const HUB_PANELS = [
  ["game_status", () => import("../settings/game_status.jsx")],
  ["game_session_history", () => import("../settings/game_session_history.jsx")],
  ["voice_hud", () => import("../settings/voice_hud.jsx")],
  ["gaming_hud", () => import("../settings/gaming_hud.jsx")],
  ["instant_clip", () => import("../settings/instant_clip.jsx")],
  ["clipboard_history", () => import("../settings/clipboard_history.jsx")],
  ["quick_file_drop", () => import("../settings/quick_file_drop.jsx")],
  ["app_lock", () => import("../settings/app_lock.jsx")],
  ["quick_actions", () => import("../settings/quick_actions.jsx")],
  ["workspace_profiles", () => import("../settings/workspace_profiles.jsx")],
  ["desktop_automations", () => import("../settings/desktop_automations.jsx")],
  ["activity_timeline", () => import("../settings/activity_timeline.jsx")],
  ["command_center", () => import("../settings/command_center.jsx")],
  ["widgets", () => import("../settings/widgets.jsx")],
  ["custom_layouts", () => import("../settings/custom_layouts.jsx")],
  ["multi_account", () => import("../settings/multi_account.jsx")],
];

const LAZY = Object.fromEntries(HUB_PANELS.map(([k, load]) => [k, lazy(() => load().then((m) => ({ default: m.Panel })))]));

export function openGamingHub(key = null) {
  try { window.dispatchEvent(new CustomEvent("descall:premium:gaming-hub", { detail: { key } })); } catch { /* ignore */ }
}

export default function GamingHub({ initialKey = null, onClose }) {
  const t = useT();
  const { has } = usePremium();
  const keys = useMemo(() => HUB_PANELS.map(([k]) => k).filter((k) => has(k)), [has]);
  const [cur, setCur] = useState(initialKey && keys.includes(initialKey) ? initialKey : keys[0] || null);
  const Panel = cur ? LAZY[cur] : null;
  return createPortal((
    <div className="pg-modal-backdrop" onClick={onClose} data-testid="pg-hub">
      <div className="pg-modal" role="dialog" aria-modal="true" aria-label={t("premiumGaming.hub.title")} onClick={(e) => e.stopPropagation()}>
        <div className="pg-modal-head">
          <h2>{t("premiumGaming.hub.title")}</h2>
          <button type="button" className="pg-btn is-small" onClick={onClose} aria-label={t("premiumGaming.common.close")}><X size={14} /></button>
        </div>
        <div className="pg-hub">
          <nav className="pg-hub-nav" aria-label={t("premiumGaming.hub.title")}>
            {keys.map((k) => (
              <button key={k} type="button" className={k === cur ? "is-active" : ""} onClick={() => setCur(k)} data-testid={`pg-hub-${k}`}>
                <span>{t(`premiumGaming.names.${k}`)}</span>
                {FEATURES[k]?.tier === "ultra" ? <span className="pg-tier">{t("premium.name.ultraShort")}</span> : null}
              </button>
            ))}
          </nav>
          <div>
            <Suspense fallback={null}>
              {Panel ? (
                // Same panels as Settings > Descall+ (E style controls from ../story/kit.jsx).
                <div className="ps-root ps-panel" data-testid={`pg-panel-${cur}`}>
                  <h3 className="ps-hubhead">{t(`premium.f.${cur}.name`)}</h3>
                  <Panel />
                </div>
              ) : <p className="pg-muted">{t("premiumGaming.hub.empty")}</p>}
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
