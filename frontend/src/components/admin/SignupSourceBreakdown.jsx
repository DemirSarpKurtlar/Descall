import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GROUP_HUES } from "./signupSourceLabels.js";
import { useLocale } from "../../context/LocaleContext";

function Bar({ pct, hue, muted }) {
  return (
    <div className="ssb-track" aria-hidden="true">
      <motion.div
        className={`ssb-fill${muted ? " is-muted" : ""}`}
        style={{ "--ssb-hue": hue }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        transition={{ type: "spring", stiffness: 260, damping: 32 }}
      />
    </div>
  );
}

function fmt(pct) {
  return `${Number(pct || 0).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;
}

function makeDict(t) {
  const pick = (section) =>
    new Proxy({}, {
      get: (_, key) => {
        const path = `adminx.signupSource.${section}.${String(key)}`;
        const value = t(path);
        return value && value !== path ? value : undefined;
      },
    });
  return { groups: pick("groups"), subs: pick("subs"), platforms: pick("platforms"), ui: pick("ui") };
}

export default function SignupSourceBreakdown({ breakdown, t: tProp }) {
  const locale = useLocale();
  const d = makeDict(tProp || locale.t);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [openSub, setOpenSub] = useState("");
  const groups = breakdown?.groups || [];
  const platforms = breakdown?.platforms || [];
  const total = breakdown?.total || 0;
  const allOpen = groups.length > 0 && groups.every((g) => openGroups.has(g.key));

  const toggleGroup = (key) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="attribution-panel ssb-panel" data-testid="signup-source-breakdown">
      <div className="ssb-head">
        <div>
          <h3>{d.ui.title}</h3>
          <p className="activity-subtitle">{d.ui.subtitle}</p>
        </div>
        <div className="ssb-head-side">
          <span className="ssb-total">
            <strong>{total}</strong> {d.ui.total}
          </span>
          {groups.length ? (
            <button
              type="button"
              className="ssb-ghost-btn"
              aria-label={allOpen ? d.ui.collapseAll : d.ui.expandAll}
              onClick={() => setOpenGroups(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
            >
              {allOpen ? d.ui.collapseAll : d.ui.expandAll}
            </button>
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? <p className="muted">{d.ui.empty}</p> : null}

      <ul className="ssb-groups">
        {groups.map((g) => {
          const open = openGroups.has(g.key);
          const hue = GROUP_HUES[g.key] ?? 220;
          const muted = g.key === "unknown";
          return (
            <li key={g.key} className={`ssb-group${open ? " is-open" : ""}`}>
              <button type="button" className="ssb-row ssb-group-row" aria-expanded={open} onClick={() => toggleGroup(g.key)}>
                <span className="ssb-dot" style={{ "--ssb-hue": hue }} />
                <span className="ssb-name">{d.groups[g.key] || g.key}</span>
                <span className="ssb-subcount">{g.subs.length}</span>
                <Bar pct={g.pct} hue={hue} muted={muted} />
                <strong className="ssb-count">{g.count}</strong>
                <em className="ssb-pct">{fmt(g.pct)}</em>
                <span className="ssb-chev" aria-hidden="true">›</span>
              </button>
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.ul
                    className="ssb-subs"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 38 }}
                  >
                    {g.subs.map((s) => {
                      const id = `${g.key}:${s.key}`;
                      const subOpen = openSub === id;
                      const hasMore = (s.details?.length || 0) > 0 || (s.platforms?.length || 0) > 1;
                      return (
                        <li key={s.key} className="ssb-sub">
                          <button
                            type="button"
                            className="ssb-row ssb-sub-row"
                            aria-expanded={subOpen}
                            disabled={!hasMore}
                            onClick={() => setOpenSub(subOpen ? "" : id)}
                          >
                            <span className="ssb-name">{d.subs[s.key] || s.key}</span>
                            <span className="ssb-ofgroup">
                              {fmt(s.pctOfGroup)} {d.ui.ofGroup}
                            </span>
                            <Bar pct={s.pctOfGroup} hue={hue} muted={muted} />
                            <strong className="ssb-count">{s.count}</strong>
                            <em className="ssb-pct">{fmt(s.pct)}</em>
                            <span className="ssb-chev" aria-hidden="true">{hasMore ? "›" : ""}</span>
                          </button>
                          {subOpen ? (
                            <div className="ssb-drill">
                              {s.details?.length ? (
                                <div>
                                  <h4>{d.ui.details}</h4>
                                  <ul className="attribution-list">
                                    {s.details.map((x) => (
                                      <li key={x.key}>
                                        <span className="ssb-detail-key">{x.key}</span>
                                        <strong>{x.count}</strong>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}
                              {s.platforms?.length ? (
                                <div>
                                  <h4>{d.ui.platformMix}</h4>
                                  <div className="ssb-chips">
                                    {s.platforms.map((p) => (
                                      <span key={p.key} className="ssb-chip">
                                        {d.platforms[p.key] || p.key} <strong>{p.count}</strong>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      {platforms.length ? (
        <div className="ssb-platforms">
          <h4>{d.ui.platformTitle}</h4>
          <ul className="ssb-groups">
            {platforms.map((p) => (
              <li key={p.key}>
                <div className="ssb-row ssb-static-row">
                  <span className="ssb-name">{d.platforms[p.key] || p.key}</span>
                  <Bar pct={p.pct} hue={205} muted={p.key === "unknown"} />
                  <strong className="ssb-count">{p.count}</strong>
                  <em className="ssb-pct">{fmt(p.pct)}</em>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
