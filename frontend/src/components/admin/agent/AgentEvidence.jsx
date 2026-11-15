/* Plan row evidence (Taslak B1): the link graph to related accounts and "why this action". */
import { useId } from "react";

const TONE = {
  hot: { line: "rgba(242,63,67,.65)", dash: null, fill: "#3a1d22", stroke: "#f23f43", text: "#ff9a9c", label: "rgba(255,154,156,.92)" },
  warn: { line: "rgba(242,169,59,.55)", dash: "4 4", fill: "#2b2a1d", stroke: "#f2a93b", text: "#ffc773", label: "rgba(255,199,115,.92)" },
  info: { line: "rgba(120,148,255,.5)", dash: "4 4", fill: "#1e2340", stroke: "#6d8cff", text: "#b6c4ff", label: "rgba(182,196,255,.92)" },
};

function initial(name) {
  return String(name || "?").replace(/^@/, "").charAt(0).toLocaleUpperCase("tr-TR") || "?";
}

export function LinkGraph({ center, links }) {
  const gid = useId();
  const list = (links || []).slice(0, 4);
  const W = 230;
  const H = 110;
  const cx = 40;
  const cy = H / 2;
  const nodes = list.map((l, k) => {
    const y = list.length === 1 ? 30 : 18 + ((H - 36) * k) / Math.max(1, list.length - 1);
    return { ...l, x: 190, y, tone: TONE[l.tone] || TONE.info };
  });
  return (
    <svg className="ago-graph" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-labelledby={`${gid}-t`}>
      <title id={`${gid}-t`}>{[center, ...list.map((l) => `${l.relation} @${l.username}`)].join(", ")}</title>
      {nodes.map((n, k) => (
        <line key={`l${k}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke={n.tone.line} strokeWidth="2" strokeDasharray={n.tone.dash || undefined} />
      ))}
      <circle cx={cx} cy={cy} r="18" fill="#6d8cff" />
      <text x={cx} y={cy + 5} fill="#fff" fontSize="13" fontWeight="800" textAnchor="middle">{initial(center)}</text>
      {nodes.map((n, k) => {
        const mx = (cx + n.x) / 2 + 6;
        const my = (cy + n.y) / 2 + (n.y < cy ? -6 : 12);
        return (
          <g key={`n${k}`}>
            <circle cx={n.x} cy={n.y} r="16" fill={n.tone.fill} stroke={n.tone.stroke} strokeWidth="2" />
            <text x={n.x} y={n.y + 5} fill={n.tone.text} fontSize="12" fontWeight="800" textAnchor="middle">{initial(n.username)}</text>
            {n.relation ? (
              <text x={mx} y={my} fill={n.tone.label} fontSize="10" fontWeight="700" textAnchor="middle">{n.relation}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export default function AgentEvidence({ item, t, onOpenUser }) {
  const ev = item.evidence || {};
  const links = ev.links || [];
  const caption = links
    .slice(0, 3)
    .map((l) => `@${l.username}${l.note ? ` ${l.note}` : l.tone === "hot" ? ` ${t("agentOps.evidence.banned")}` : ""}`)
    .join(" · ");
  const stats = ev.stats?.length ? ev.stats : item.risk != null ? [{ label: t("agentOps.plan.risk"), value: String(item.risk) }] : [];
  return (
    <div className="ago-evi">
      <div className="ago-evi-graph">
        <div className="ago-lab">{t("agentOps.evidence.links")}</div>
        {links.length ? <LinkGraph center={item.username} links={links} /> : <p className="ago-muted ago-evi-none">{t("agentOps.evidence.noLinks")}</p>}
        {caption ? <div className="ago-sub ago-evi-cap">{caption}</div> : null}
      </div>
      <div className="ago-evi-why">
        <div className="ago-lab">{t("agentOps.evidence.why")}</div>
        <p className="ago-evi-reason">{ev.reason || t("agentOps.evidence.noReason")}</p>
        {ev.quote ? <div className="ago-quote">“{ev.quote}”</div> : null}
        <div className="ago-evi-stats">
          {stats.map((s, i) => (
            <span key={i} className="ago-sg">{s.label} {s.value}</span>
          ))}
          <span className="ago-sp" />
          {item.userId && onOpenUser ? (
            <button type="button" className="ago-lnk" onClick={() => onOpenUser(item.userId)}>{t("agentOps.evidence.openFile")}</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
