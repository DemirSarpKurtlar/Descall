import { useEffect, useState } from "react";
import "../../styles/admin-edge-realtime.css";

const PLATFORMS = ["web", "electron", "ios", "android"];
/** Visible platform names (the stored ids stay the same). */
const PLATFORM_LABEL = { web: "Web", electron: "Desktop", ios: "iOS", android: "Android" };

/**
 * Edge realtime rollout controls (scale plan S2, 2.11.6). Shadow → team
 * allow list → percent per platform. The master switch is the kill switch:
 * off moves every edge client back to Render within seconds.
 */
export default function AdminEdgeRealtime({ system, busy, patchSystem, t }) {
  const cfg = system?.config || {};
  const edge = system?.edge || {};
  const [percent, setPercent] = useState(String(cfg.edgeRealtimePercent ?? 0));
  const [allow, setAllow] = useState((cfg.edgeRealtimeAllowUserIds || []).join(", "));
  useEffect(() => {
    setPercent(String(cfg.edgeRealtimePercent ?? 0));
    setAllow((cfg.edgeRealtimeAllowUserIds || []).join(", "));
  }, [cfg.edgeRealtimePercent, cfg.edgeRealtimeAllowUserIds]);
  const platforms = Array.isArray(cfg.edgeRealtimePlatforms) && cfg.edgeRealtimePlatforms.length ? cfg.edgeRealtimePlatforms : ["web"];
  const enabled = cfg.featureFlags?.edgeRealtime === true;
  const togglePlatform = (p) => {
    const next = platforms.includes(p) ? platforms.filter((x) => x !== p) : [...platforms, p];
    patchSystem({ edgeRealtimePlatforms: next });
  };
  return (
    <div className="admin-edge-realtime" data-testid="admin-edge-realtime">
      <div className="admin-edge-row">
        <strong>{t("Edge realtime (Cloudflare)")}</strong>
        <span className="admin-edge-status">
          {edge.enabled ? (edge.open ? t("Bridge connected") : t("Bridge down")) : t("Bridge not configured")}
          {edge.enabled ? ` · ${edge.clients || 0} ${t("edge sockets")}` : ""}
        </span>
      </div>
      {/* Same switch row as the rest of System (UI audit #117), the effect as the subtitle. */}
      <div className="admin-edge-row admin-edge-switch">
        <span className="admin-edge-copy">
          <span>{t("Master switch")}</span>
          <small>{t("When off, every client goes back to the main server.")}</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t("Master switch")}
          disabled={busy}
          className={`us-toggle${enabled ? " active" : ""}`}
          onClick={() => patchSystem({ featureFlags: { ...(cfg.featureFlags || {}), edgeRealtime: !enabled } })}
        >
          <span className="us-toggle-knob" />
        </button>
      </div>
      <label className="admin-edge-row">
        <span>{t("Rollout percent")}</span>
        <input
          type="number"
          min={0}
          max={100}
          value={percent}
          disabled={busy}
          onChange={(e) => setPercent(e.target.value)}
          onBlur={() => patchSystem({ edgeRealtimePercent: Number(percent) || 0 })}
        />
      </label>
      <div className="admin-edge-row">
        <span>{t("Platforms")}</span>
        <span className="admin-edge-seg" role="group" aria-label={t("Platforms")}>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              className={`admin-edge-seg-btn${platforms.includes(p) ? " is-on" : ""}`}
              aria-pressed={platforms.includes(p)}
              disabled={busy}
              onClick={() => togglePlatform(p)}
            >
              {PLATFORM_LABEL[p] === "Desktop" ? t("Desktop") : PLATFORM_LABEL[p]}
            </button>
          ))}
        </span>
      </div>
      <label className="admin-edge-row">
        <span>{t("Team user ids (any platform)")}</span>
        <input
          type="text"
          value={allow}
          disabled={busy}
          placeholder={t("User IDs, separated by commas")}
          onChange={(e) => setAllow(e.target.value)}
          onBlur={() => patchSystem({ edgeRealtimeAllowUserIds: allow })}
        />
      </label>
    </div>
  );
}
