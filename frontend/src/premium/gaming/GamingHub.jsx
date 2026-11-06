/* Gaming and productivity hub: the settings panels of this group in one window. The
   Descall+ settings page renders the same panels (src/premium/settings/*.jsx). */
import { lazy, Suspense, useMemo, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { usePremium } from "../usePremium.js";
import { FEATURES } from "../features.js";
import { X } from "../../components/ui/Icon.jsx";
import "./gaming.css";

export const HUB_PANELS = [
  ["game_status", () => import("../settings/GameStatus.jsx")],
  ["game_session_history", () => import("../settings/GameSessionHistory.jsx")],
  ["voice_hud", () => import("../settings/VoiceHud.jsx")],
  ["gaming_hud", () => import("../settings/GamingHud.jsx")],
  ["instant_clip", () => import("../settings/InstantClip.jsx")],
  ["clipboard_history", () => import("../settings/ClipboardHistory.jsx")],
  ["quick_file_drop", () => import("../settings/QuickFileDrop.jsx")],
  ["app_lock", () => import("../settings/AppLock.jsx")],
  ["quick_actions", () => import("../settings/QuickActions.jsx")],
  ["workspace_profiles", () => import("../settings/WorkspaceProfiles.jsx")],
  ["desktop_automations", () => import("../settings/DesktopAutomations.jsx")],
  ["activity_timeline", () => import("../settings/ActivityTimeline.jsx")],
  ["command_center", () => import("../settings/CommandCenter.jsx")],
  ["widgets", () => import("../settings/Widgets.jsx")],
  ["custom_layouts", () => import("../settings/CustomLayouts.jsx")],
  ["multi_account", () => import("../settings/MultiAccount.jsx")],
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
  return (
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
            <Suspense fallback={null}>{Panel ? <Panel /> : <p className="pg-muted">{t("premiumGaming.hub.empty")}</p>}</Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
