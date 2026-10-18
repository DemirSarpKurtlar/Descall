import { useEffect, useState } from "react";
import GlassCheckbox from "../ui/GlassCheckbox";
import "../../styles/admin-edge-realtime.css";

const PLATFORMS = ["web", "electron", "ios", "android"];

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
      <label className="admin-edge-row">
        <GlassCheckbox
          checked={enabled}
          disabled={busy}
          onChange={(e) =>
            patchSystem({ featureFlags: { ...(cfg.featureFlags || {}), edgeRealtime: e.target.checked } })
          }
        />
        <span>{t("Master switch (off = everyone back to Render)")}</span>
      </label>
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
        {PLATFORMS.map((p) => (
          <label key={p} className="admin-edge-chip">
            <GlassCheckbox checked={platforms.includes(p)} disabled={busy} onChange={() => togglePlatform(p)} /> {p}
          </label>
        ))}
      </div>
      <label className="admin-edge-row">
        <span>{t("Team user ids (any platform)")}</span>
        <input
          type="text"
          value={allow}
          disabled={busy}
          placeholder="uuid, uuid"
          onChange={(e) => setAllow(e.target.value)}
          onBlur={() => patchSystem({ edgeRealtimeAllowUserIds: allow })}
        />
      </label>
    </div>
  );
}
