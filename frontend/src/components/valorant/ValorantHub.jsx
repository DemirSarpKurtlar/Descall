import { useEffect, useState } from "react";
import { ArrowLeft, Crosshair, Sparkles } from "lucide-react";
import LfgWorkspace from "../lfg/LfgWorkspace";
import CompanionAuthPanel from "./CompanionAuthPanel";
import { useT } from "../../context/LocaleContext";
import { useGlassShell } from "../layout/glass/GlassShell";
import {
  getPublicFeatures,
  readStoredValorantTab,
  resolveValorantTab,
  usePublicFeatures,
} from "../../lib/publicFeatures";

/**
 * Valorant hub — Play rail slot shell.
 * Tabs: Companion (Adım 2 Riot auth) + LFG (existing LfgWorkspace 1:1).
 * Companion mounts only when active. LFG stays mounted (lobby) but hard-hides off-tab.
 */
export default function ValorantHub({
  me,
  socket,
  onClose,
  onGroupCreated,
  onOpenGroup,
  onJoinVoice,
}) {
  const t = useT();
  const glassShell = useGlassShell();
  const features = usePublicFeatures();
  const showCompanion = features.valorantCompanion !== false;
  const showLfg = features.valorantLfg !== false;
  const showTabs = showCompanion && showLfg;
  /* iOS glass hides Companion. The hub header is the opaque bar the LFG
     glass rules never reached — drop it and let LfgWorkspace own Back. */
  const glassLfg = Boolean(glassShell) && !showTabs;
  // Default Companion when both tabs are enabled. sessionStorage can still
  // force LFG/Companion after RSO, but only if that tab is enabled.
  const [tab, setTab] = useState(() => resolveValorantTab(readStoredValorantTab(), getPublicFeatures()) || "companion");

  useEffect(() => {
    const next = resolveValorantTab(tab, features);
    if (!next) {
      onClose?.();
      return;
    }
    if (next !== tab) setTab(next);
  }, [features, tab, onClose]);

  useEffect(() => {
    const onTab = (event) => {
      const next = resolveValorantTab(event?.detail?.tab, getPublicFeatures());
      if (next) setTab(next);
    };
    window.addEventListener("descall:valorant-tab", onTab);
    return () => window.removeEventListener("descall:valorant-tab", onTab);
  }, []);

  return (
    <div className="valorant-hub" data-tab={tab} data-glass-lfg={glassLfg ? "1" : undefined}>
      {glassLfg ? null : (
      <header className="valorant-hub-header">
        <div className="valorant-hub-header-left">
          {onClose ? (
            <button
              type="button"
              className="valorant-hub-back"
              onClick={onClose}
              title={t("Back to Descall")}
              aria-label={t("Back to Descall")}
            >
              <ArrowLeft size={18} />
              <span className="valorant-hub-back-label">{t("Descall")}</span>
            </button>
          ) : null}
          <div className="valorant-hub-title">
            <div className="valorant-hub-kicker">{t("Valorant")}</div>
            <h2>{t("valorantHub.title")}</h2>
          </div>
        </div>

        {showTabs ? (
        <div className="valorant-hub-tabs" role="tablist" aria-label={t("valorantHub.title")}>
          <button
            type="button"
            role="tab"
            id="valorant-tab-companion"
            aria-selected={tab === "companion"}
            aria-controls="valorant-panel-companion"
            className={`valorant-hub-tab${tab === "companion" ? " is-active" : ""}`}
            onClick={() => setTab("companion")}
          >
            <Sparkles size={14} aria-hidden />
            <span>{t("valorantHub.companion")}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="valorant-tab-lfg"
            aria-selected={tab === "lfg"}
            aria-controls="valorant-panel-lfg"
            className={`valorant-hub-tab${tab === "lfg" ? " is-active" : ""}`}
            onClick={() => setTab("lfg")}
          >
            <Crosshair size={14} aria-hidden />
            <span>{t("valorantHub.lfg")}</span>
          </button>
        </div>
        ) : null}
      </header>
      )}

      <div className="valorant-hub-body">
        {/* Active-only Companion mount — never leave accordion/card under LFG. */}
        {showCompanion && tab === "companion" ? (
          <div
            id="valorant-panel-companion"
            role="tabpanel"
            aria-labelledby="valorant-tab-companion"
            className="valorant-hub-panel"
          >
            <CompanionAuthPanel />
          </div>
        ) : null}

        {/*
          Keep LFG mounted (lobby state) but hard-hide when Companion is active.
          mobile.css must not force display:flex on [hidden] panels.
          When LFG is disabled the panel is not rendered.
        */}
        {showLfg ? (
        <div
          id="valorant-panel-lfg"
          role="tabpanel"
          aria-labelledby="valorant-tab-lfg"
          className={`valorant-hub-panel valorant-hub-panel-lfg${tab === "lfg" ? "" : " is-hidden"}`}
          hidden={tab !== "lfg"}
          aria-hidden={tab !== "lfg"}
        >
          {/*
            Desktop hub header owns Back. On iOS glass the hub header is gone,
            so LfgWorkspace draws the glass back button.
          */}
          <LfgWorkspace
            me={me}
            socket={socket}
            onClose={glassLfg ? onClose : undefined}
            onGroupCreated={onGroupCreated}
            onOpenGroup={onOpenGroup}
            onJoinVoice={onJoinVoice}
          />
        </div>
        ) : null}
      </div>
    </div>
  );
}

