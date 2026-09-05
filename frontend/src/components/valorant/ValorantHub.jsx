import { useState } from "react";
import { ArrowLeft, Crosshair, Sparkles } from "lucide-react";
import LfgWorkspace from "../lfg/LfgWorkspace";
import CompanionAuthPanel from "./CompanionAuthPanel";
import { useT } from "../../context/LocaleContext";

/**
 * Valorant hub — Play rail slot shell.
 * Tabs: Companion (Adım 2 Riot auth) + LFG (existing LfgWorkspace 1:1).
 * Keep LFG mounted while switching tabs so lobby state survives.
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
  // Default LFG so existing Play → stack flow stays unbroken for Adım 1 smoke.
  // RSO callback may request Companion via sessionStorage.
  const [tab, setTab] = useState(() => {
    try {
      const wanted = sessionStorage.getItem("descall.valorant.tab");
      if (wanted === "companion" || wanted === "lfg") {
        sessionStorage.removeItem("descall.valorant.tab");
        return wanted;
      }
    } catch {
      /* ignore */
    }
    return "lfg";
  });

  return (
    <div className="valorant-hub" data-tab={tab}>
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
      </header>

      <div className="valorant-hub-body">
        <div
          id="valorant-panel-companion"
          role="tabpanel"
          aria-labelledby="valorant-tab-companion"
          className={`valorant-hub-panel${tab === "companion" ? "" : " is-hidden"}`}
          hidden={tab !== "companion"}
          aria-hidden={tab !== "companion"}
        >
          <CompanionAuthPanel />
        </div>

        <div
          id="valorant-panel-lfg"
          role="tabpanel"
          aria-labelledby="valorant-tab-lfg"
          className={`valorant-hub-panel valorant-hub-panel-lfg${tab === "lfg" ? "" : " is-hidden"}`}
          hidden={tab !== "lfg"}
          aria-hidden={tab !== "lfg"}
        >
          {/*
            Do not pass onClose — hub header owns Back to Descall.
            LfgWorkspace still mounts 1:1 for create/join/party code/Riot rank.
          */}
          <LfgWorkspace
            me={me}
            socket={socket}
            onGroupCreated={onGroupCreated}
            onOpenGroup={onOpenGroup}
            onJoinVoice={onJoinVoice}
          />
        </div>
      </div>
    </div>
  );
}

