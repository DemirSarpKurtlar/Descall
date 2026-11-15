/*
 * Settings › Cüzdan ve kazanç (end-of-call DesCoin summary, Nov 2026): the summary
 * on / off, the minimum DesCoin to show it (1 / 5 / 10 / 25 / 50), a live preview on
 * desktop and phone with "play a sample", today's earning limits and the recent call
 * earnings (wallet history). The setting is stored with Settings › Görünüm and synced
 * to the account (lib/appearanceSync.js updateCallCoinPrefs).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale, useT } from "../../context/LocaleContext";
import { formatNumber, formatTime, formatDate } from "../../i18n/format.js";
import { S3Toggle } from "./SettingsV3.jsx";
import CallCoinSummary, { sampleCallCoinSummary } from "../descoin/CallCoinSummary.jsx";
import { openWalletHistory, playCallCoinSample } from "../descoin/CallCoinSummaryHost.jsx";
import { CcsIcon, MiniCoin } from "../descoin/callCoinIcons.jsx";
import {
  CALL_COIN_PREFS_EVENT,
  CALL_COIN_THRESHOLDS,
  groupWalletEntries,
  readCallCoinPrefs,
} from "../../lib/callCoinPrefs.js";
import "../../styles/call-coin-summary.css";

const HOURLY = { voice: 30, screen: 40 };

function nextUtcMidnight(now = Date.now()) {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

export default function WalletSettingsTab({ loadDaily, loadLedger, now: frozenNow }) {
  const t = useT();
  const { locale } = useLocale();
  const [prefs, setPrefs] = useState(() => readCallCoinPrefs());
  const [daily, setDaily] = useState(null);
  const [recent, setRecent] = useState(null);
  const now = useMemo(() => frozenNow ?? Date.now(), [frozenNow]);
  const sample = useMemo(() => sampleCallCoinSummary(t, { now }), [t, now]);
  const fmt = (n) => formatNumber(Math.max(0, Math.round(Number(n) || 0)), locale);

  useEffect(() => {
    const on = (e) => setPrefs(e?.detail && "enabled" in e.detail ? e.detail : readCallCoinPrefs());
    window.addEventListener(CALL_COIN_PREFS_EVENT, on);
    return () => window.removeEventListener(CALL_COIN_PREFS_EVENT, on);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const api = loadDaily && loadLedger ? null : await import("../../api/shop.js");
        const [d, l] = await Promise.allSettled([(loadDaily || api.getDesCoinDaily)(), (loadLedger || api.getDesCoinLedger)(200)]);
        if (!alive) return;
        if (d.status === "fulfilled") setDaily(d.value?.daily || d.value || null);
        if (l.status === "fulfilled") setRecent(groupWalletEntries(l.value?.entries || []).filter((r) => r.kind === "call").slice(0, 4));
        else setRecent([]);
      } catch {
        if (alive) setRecent([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadDaily, loadLedger]);

  const update = async (patch) => {
    const { updateCallCoinPrefs } = await import("../../lib/appearanceSync.js");
    setPrefs(updateCallCoinPrefs(patch));
  };

  const goals = daily?.goals || null;
  const bars = goals
    ? [
        { key: "voice", icon: "mic", label: t("coinpop.settings.voice"), earned: goals.voice?.earned, cap: goals.voice?.cap, cls: "is-voice" },
        { key: "screen", icon: "screen", label: t("coinpop.settings.screen"), earned: goals.screenshare?.earned, cap: goals.screenshare?.cap, cls: "is-screen" },
        { key: "total", icon: "trend", label: t("coinpop.settings.total"), earned: goals.global?.earned, cap: goals.global?.cap, cls: "is-total" },
      ]
    : [];

  return (
    <div className="ccset" lang={locale}>
      <header className="ccset-hd">
        <h1>{t("coinpop.settings.title")}</h1>
        <p>{t("coinpop.settings.subtitle")}</p>
      </header>
      <div className="ccset-grid">
        <div className="ccset-col">
          <section className="ccset-card">
            <div className="ccset-opt">
              <div className="ccset-c">
                <b>{t("coinpop.settings.toggle")}</b>
                <small>{t("coinpop.settings.toggleSub")}</small>
              </div>
              <S3Toggle checked={prefs.enabled} onChange={(v) => update({ callCoinSummary: v })} label={t("coinpop.settings.toggle")} />
            </div>
            <div className={`ccset-opt${prefs.enabled ? "" : " is-off"}`}>
              <div className="ccset-c">
                <b id="ccset-th">{t("coinpop.settings.threshold")}</b>
                <small>{t("coinpop.settings.thresholdSub")}</small>
              </div>
              <div className="ccset-seg" role="radiogroup" aria-labelledby="ccset-th">
                {CALL_COIN_THRESHOLDS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={prefs.threshold === n}
                    aria-label={`${fmt(n)} ${t("coinpop.unit")}`}
                    className={prefs.threshold === n ? "on" : ""}
                    disabled={!prefs.enabled}
                    onClick={() => update({ callCoinThreshold: n })}
                  >
                    <span className="num">{fmt(n)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ccset-opt">
              <div className="ccset-c">
                <b>{t("coinpop.settings.contexts")}</b>
                <div className="ccset-ctx">
                  <span className="ccs-chip"><CcsIcon name="phone" size={12} />{t("coinpop.ctx.dm")}</span>
                  <span className="ccs-chip"><CcsIcon name="users" size={12} />{t("coinpop.ctx.group")}</span>
                  <span className="ccs-chip"><CcsIcon name="volume" size={12} />{t("coinpop.ctx.server")}</span>
                </div>
                <small>{t("coinpop.settings.contextsSub")}</small>
              </div>
            </div>
          </section>

          <section className="ccset-card">
            <h3>
              <MiniCoin size={16} />
              {t("coinpop.settings.limits")}
              <span className="ccset-muted">{t("coinpop.settings.limitsReset", { time: formatTime(nextUtcMidnight(now), locale) })}</span>
            </h3>
            {bars.map((b) => {
              const pct = b.cap ? Math.min(100, ((b.earned || 0) / b.cap) * 100) : 0;
              return (
                <div className="ccset-bar" key={b.key}>
                  <div className="ccset-bar-t">
                    <span><CcsIcon name={b.icon} size={14} />{b.label}</span>
                    <b className="num">{fmt(b.earned)}<span className="ccset-muted"> / {fmt(b.cap)}</span></b>
                  </div>
                  <div className={`ccset-track ${b.cls}`}><i style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
            <p className="ccset-foot">{t("coinpop.settings.hourly", { v: fmt(HOURLY.voice), s: fmt(HOURLY.screen) })}</p>
          </section>
        </div>

        <div className="ccset-col">
          <section className="ccset-pvw">
            <div className="ccset-lab">
              <span>{t("coinpop.settings.preview")}</span>
              <span className="ccset-lab-r"><CcsIcon name="eye" size={12} />{t("coinpop.settings.previewSub")}</span>
            </div>
            <div className={`ccset-frames${prefs.enabled ? "" : " is-off"}`} aria-hidden="true" inert="">
              <div className="ccset-desk">
                <div className="ccset-scale is-desk">
                  <CallCoinSummary summary={sample} preview variant="desktop" now={now} still />
                </div>
              </div>
              <div className="ccset-phone">
                <div className="ccset-scale is-phone">
                  <CallCoinSummary summary={sample} preview variant="sheet" now={now} still />
                </div>
              </div>
              {!prefs.enabled ? <span className="ccset-offtag">{t("coinpop.settings.off")}</span> : null}
            </div>
            <button type="button" className="ccset-play" onClick={playCallCoinSample}>
              <CcsIcon name="play" size={14} />
              {t("coinpop.settings.play")}
            </button>
          </section>

          <section className="ccset-card">
            <div className="ccset-lab">
              <span>{t("coinpop.settings.recent")}</span>
              <button type="button" className="ccs-link" onClick={() => openWalletHistory({})}>
                {t("coinpop.settings.all")}
              </button>
            </div>
            {recent == null ? null : recent.length === 0 ? (
              <p className="ccset-muted ccset-empty">{t("coinpop.settings.recentEmpty")}</p>
            ) : (
              recent.map((r) => {
                const below = !prefs.enabled || r.amount < prefs.threshold;
                const d = r.at ? new Date(r.at) : null;
                return (
                  <button type="button" key={r.id} className="ccset-hist" onClick={() => openWalletHistory({ receipt: r.receipt, sessionId: r.id })}>
                    <span className={`ccset-hist-ic${below ? " is-dim" : ""}`}>
                      <CcsIcon name={r.context === "server" ? "volume" : r.context === "group" ? "users" : "phone"} size={14} />
                    </span>
                    <span className="ccset-hist-t">
                      <b>{r.receipt ? t("coinpop.foot.receiptShort", { id: r.receipt }) : t("coinpop.wallet.call")}</b>
                      <small className="num">
                        {d ? `${formatDate(d, locale, { day: "numeric", month: "short" })} ${formatTime(d, locale)}` : ""}
                        {below ? ` · ${t("coinpop.settings.hidden")}` : ""}
                      </small>
                    </span>
                    <em className={`num${below ? " is-dim" : ""}`}>+{fmt(r.amount)}</em>
                  </button>
                );
              })
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
