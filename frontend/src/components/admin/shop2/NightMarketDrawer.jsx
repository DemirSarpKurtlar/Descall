/**
 * Gece pazarı zamanlayıcı (Draft B frame B3): calendar / random / manual mode, open hours
 * on a 24 h track (crosses midnight), discount range with its distribution, card count,
 * buys per card and per night, who sees it (with the eligible count), the live flip
 * preview of what a user sees, forecast, past nights. Open now (reason, 5 min undo),
 * skip this week (reason), save and schedule (reason).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { ChevronLeft, ChevronRight, Monitor, Moon, Pause, Save, Smartphone, Zap } from "./icons.js";
import { shop2Api } from "./adminShop2Api.js";
import { Coin, Dialog, Drawer, Pill, ReasonField, Seg, Skel, Switch, Thumb, useFmt, fdt } from "./ui.jsx";
import { NumBox } from "./AlgorithmPanel.jsx";
import { changedPaths, clock, discountBuckets, istDay, monthGrid, nextNight, nightHours, reasonOk, weekdayMon } from "./shop2Model.js";

const DEFAULT = { mode: "calendar", weekdays: [4, 5], dates: [], skipDates: [], openFrom: "22:00", openTo: "02:00", cards: 6, flips: 3, keepMax: 2, discountMin: 15, discountMax: 60, skew: 2.2, eligibility: { minAccountDays: 0, premiumOnly: false } };
const hhmm = (h) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;
const hours = (s) => {
  const [h, m] = String(s || "0:0").split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
};

export default function NightMarketDrawer({ open, onClose, data, now, onSaved, notify, fail }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const saved = useMemo(() => ({ ...DEFAULT, ...(data?.schedule || {}), eligibility: { ...DEFAULT.eligibility, ...(data?.schedule?.eligibility || {}) } }), [data]);
  const [s, setS] = useState(saved);
  const [month, setMonth] = useState(() => {
    const d = istDay(now);
    return [Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1];
  });
  const [device, setDevice] = useState("desktop");
  const [flipped, setFlipped] = useState({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // "open" | "skip"
  const [fullReport, setFullReport] = useState(false);
  const [pv, setPv] = useState(null); // live preview deck + eligible count

  useEffect(() => {
    if (open) {
      setS(saved);
      setReason("");
      setFlipped({ 0: true, 1: true, 2: true });
      setPv(null);
    }
  }, [open, saved, data]);

  // The deck the sample user would get with these settings (server draws it, nothing saved).
  useEffect(() => {
    if (!open) return undefined;
    const id = setTimeout(() => {
      shop2Api
        .nightPreview({ cards: s.cards, discountMin: s.discountMin, discountMax: s.discountMax, skew: s.skew, eligibility: { minAccountDays: s.eligibility.minAccountDays || undefined, premiumOnly: s.eligibility.premiumOnly || undefined } })
        .then(setPv)
        .catch(() => {});
    }, 350);
    return () => clearTimeout(id);
  }, [open, s.cards, s.discountMin, s.discountMax, s.skew, s.eligibility.minAccountDays, s.eligibility.premiumOnly]);

  const changes = changedPaths(s, saved);
  const next = changes.length ? nextNight(s, now) : data?.open ? null : data?.next?.at || nextNight(s, now);
  const dist = discountBuckets(s.discountMin, s.discountMax);
  const distMax = Math.max(0.01, ...dist.buckets.map((b) => b.weight));
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const grid = monthGrid(month[0], month[1]);
  const today = istDay(now);
  const weekdayNames = useMemo(() => Array.from({ length: 7 }, (_, i) => fdt(new Date(Date.UTC(2026, 10, 9 + i, 9)).toISOString(), locale, { weekday: "narrow" })), [locale]);
  const isNight = (d) => {
    if (!d) return false;
    if ((s.skipDates || []).includes(d)) return false;
    if ((s.dates || []).includes(d)) return true;
    return s.mode === "calendar" && (s.weekdays || []).includes(weekdayMon(d));
  };
  const toggleDay = (d) => {
    if (s.mode === "calendar" && (s.weekdays || []).includes(weekdayMon(d))) {
      const skip = new Set(s.skipDates || []);
      skip.has(d) ? skip.delete(d) : skip.add(d);
      set({ skipDates: [...skip].sort() });
    } else {
      const ds = new Set(s.dates || []);
      ds.has(d) ? ds.delete(d) : ds.add(d);
      set({ dates: [...ds].sort() });
    }
  };
  const toggleWeekday = (w) => {
    const ws = new Set(s.weekdays || []);
    ws.has(w) ? ws.delete(w) : ws.add(w);
    set({ weekdays: [...ws].sort() });
  };
  const fromH = hours(s.openFrom);
  const toH = hours(s.openTo);
  const span = nightHours(s.openFrom, s.openTo);
  const crosses = toH <= fromH;
  const save = async () => {
    setBusy(true);
    try {
      await shop2Api.saveNightMarket(s, saved, reason.trim(), data?.raw);
      notify(t("adminShop2.toast.nightSaved"));
      onSaved?.();
      onClose();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const cards = pv?.cards || data?.preview?.cards || [];
  const sample = null;
  const serverDist = (pv?.distribution?.length ? pv.distribution : data?.distribution) || [];
  const closesIn = (data?.open?.closesAt ? Date.parse(data.open.closesAt) : null) ?? (next ? Date.parse(next) + span * 3600000 : null);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Moon}
      tone="violet"
      title={t("adminShop2.nm.title")}
      subtitle={t("adminShop2.nm.sub")}
      badge={next ? <Pill tone="amber">{t("adminShop2.nm.next", { when: fdt(next, locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</Pill> : null}
      width={700}
      testId="as2-night-drawer"
      footer={
        <>
          <button type="button" className="as2-btn is-amber-soft" onClick={() => setConfirm("open")} disabled={busy}>
            <Zap size={15} />
            {t("adminShop2.nm.openNow")}
          </button>
          <button type="button" className="as2-btn is-danger-soft" onClick={() => setConfirm("skip")} disabled={busy}>
            <Pause size={15} />
            {t("adminShop2.nm.skip")}
          </button>
          <input className="as2-ft-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("adminShop2.reason.ph")} aria-label={t("adminShop2.reason.label")} disabled={!changes.length} />
          <button type="button" className="as2-btn is-p" onClick={save} disabled={busy || !changes.length || !reasonOk(reason)} data-testid="as2-night-save">
            <Save size={15} />
            {t("adminShop2.nm.save")}
          </button>
        </>
      }
    >
      {!data ? (
        <Skel h={420} r={14} />
      ) : (
        <div className="as2-nm">
          <div className="as2-nm-top">
            <Seg
              size="sm"
              value={s.mode}
              onChange={(m) => set({ mode: m })}
              label={t("adminShop2.nm.mode")}
              options={[
                { id: "calendar", label: t("adminShop2.nm.modeCal") },
                { id: "random", label: t("adminShop2.nm.modeRandom") },
                { id: "manual", label: t("adminShop2.nm.modeManual") },
              ]}
            />
            <span className="as2-nm-rule">
              {s.mode === "manual"
                ? t("adminShop2.nm.ruleManual", { n: (s.dates || []).length })
                : t(s.mode === "random" ? "adminShop2.nm.ruleRandom" : "adminShop2.nm.ruleCal", {
                    n: (s.weekdays || []).length,
                    days: (s.weekdays || []).map((w) => fdt(new Date(Date.UTC(2026, 10, 9 + w, 9)).toISOString(), locale, { weekday: "long" })).join(", "),
                  })}
            </span>
            <span className="as2-muted as2-ml">{t("adminShop2.nm.tz")}</span>
          </div>

          <div className="as2-nm-grid">
            <div className="as2-nm-box as2-cal">
              <div className="as2-cal-h">
                <b>{fdt(new Date(Date.UTC(month[0], month[1], 15)).toISOString(), locale, { month: "long", year: "numeric" })}</b>
                <span>
                  <button type="button" className="as2-ibtn" onClick={() => setMonth(([y, m]) => (m ? [y, m - 1] : [y - 1, 11]))} aria-label={t("adminShop2.tl.prev")}>
                    <ChevronLeft size={14} />
                  </button>
                  <button type="button" className="as2-ibtn" onClick={() => setMonth(([y, m]) => (m < 11 ? [y, m + 1] : [y + 1, 0]))} aria-label={t("adminShop2.tl.next")}>
                    <ChevronRight size={14} />
                  </button>
                </span>
              </div>
              <div className="as2-cal-g">
                {weekdayNames.map((w, i) => (
                  <button key={i} type="button" className={`as2-cal-wd${(s.weekdays || []).includes(i) ? " is-on" : ""}`} onClick={() => toggleWeekday(i)} disabled={s.mode === "manual"} title={t("adminShop2.nm.weekdayHint")}>
                    {w}
                  </button>
                ))}
                {grid.map((d, i) =>
                  d ? (
                    <button
                      key={d}
                      type="button"
                      className={`as2-cal-d tnum${isNight(d) ? " is-night" : ""}${(s.skipDates || []).includes(d) ? " is-skip" : ""}${d === today ? " is-today" : ""}${d < today ? " is-past" : ""}`}
                      onClick={() => toggleDay(d)}
                      disabled={d < today}
                      aria-pressed={isNight(d)}
                    >
                      {Number(d.slice(8))}
                    </button>
                  ) : (
                    <span key={`e${i}`} />
                  )
                )}
              </div>
            </div>
            <div className="as2-nm-col">
              <div className="as2-nm-box">
                <div className="as2-nm-bh">
                  <span className="as2-cap">{t("adminShop2.nm.hours")}</span>
                  <b className="tnum">{t("adminShop2.nm.hoursV", { from: s.openFrom, to: s.openTo, n: span })}</b>
                </div>
                <div className="as2-hrs">
                  <div className="as2-hrs-track">
                    {Array.from({ length: 24 }, (_, h) => {
                      const on = crosses ? h >= fromH || h < toH : h >= fromH && h < toH;
                      return <i key={h} className={on ? "is-on" : ""} />;
                    })}
                  </div>
                  <input type="range" min="0" max="23.5" step="0.5" value={fromH} onChange={(e) => set({ openFrom: hhmm(Number(e.target.value)) })} aria-label={t("adminShop2.nm.from")} className="as2-hrs-in" />
                  <input type="range" min="0" max="23.5" step="0.5" value={toH} onChange={(e) => set({ openTo: hhmm(Number(e.target.value)) })} aria-label={t("adminShop2.nm.to")} className="as2-hrs-in" />
                  <div className="as2-hrs-x tnum">
                    {[0, 6, 12, 18, 24].map((h) => (
                      <span key={h}>{String(h).padStart(2, "0")}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="as2-nm-box">
                <div className="as2-nm-bh">
                  <span className="as2-cap">{t("adminShop2.nm.discount")}</span>
                  <b className="tnum">{t("adminShop2.nm.discountV", { a: s.discountMin, b: s.discountMax })}</b>
                </div>
                <div className="as2-dist">
                  {serverDist.length
                    ? serverDist.map((b) => {
                        const m = Math.max(0.01, ...serverDist.map((x) => Number(x.share) || 0));
                        return <i key={b.pct} className="is-in" style={{ height: `${Math.max(6, ((Number(b.share) || 0) / m) * 100)}%` }} title={`%${b.pct} · ${b.share}%`} />;
                      })
                    : dist.buckets.map((b) => <i key={b.from} className={b.inside ? "is-in" : ""} style={{ height: `${Math.max(8, (b.weight / distMax) * 100)}%` }} title={`%${b.from}`} />)}
                </div>
                <div className="as2-dual">
                  <i className="as2-dual-fill" style={{ left: `${((s.discountMin - 10) / 60) * 100}%`, right: `${100 - ((s.discountMax - 10) / 60) * 100}%` }} />
                  <input type="range" className="as2-range" min="10" max="70" step="5" value={s.discountMin} onChange={(e) => set({ discountMin: Math.min(Number(e.target.value), s.discountMax - 5) })} aria-label={t("adminShop2.nm.discountMin")} />
                  <input type="range" className="as2-range" min="10" max="70" step="5" value={s.discountMax} onChange={(e) => set({ discountMax: Math.max(Number(e.target.value), s.discountMin + 5) })} aria-label={t("adminShop2.nm.discountMax")} />
                </div>
                <p className="as2-hint">{t("adminShop2.nm.discountHint", { mean: serverDist.length ? Math.round(serverDist.reduce((a, b) => a + b.pct * (Number(b.share) || 0), 0) / Math.max(1, serverDist.reduce((a, b) => a + (Number(b.share) || 0), 0))) : dist.mean })}</p>
                <label className="as2-tg">
                  <span className="as2-muted">{t("adminShop2.nm.skew")}</span>
                  <input type="range" className="as2-range" min="0.5" max="6" step="0.1" value={s.skew} onChange={(e) => set({ skew: Number(e.target.value) })} style={{ "--rc": "#8b62f0", "--fill": `${((s.skew - 0.5) / 5.5) * 100}%` }} aria-label={t("adminShop2.nm.skew")} />
                  <b className="tnum">{f.n(s.skew, { maximumFractionDigits: 1 })}</b>
                </label>
              </div>
            </div>
          </div>

          <div className="as2-nm-trio">
            <div className="as2-nm-box">
              <span className="as2-cap">{t("adminShop2.nm.cards")}</span>
              <Seg size="sm" value={s.cards} onChange={(n) => set({ cards: n })} label={t("adminShop2.nm.cards")} options={[4, 5, 6, 7, 8].map((n) => ({ id: n, label: String(n) }))} />
            </div>
            <div className="as2-nm-box">
              <span className="as2-cap">{t("adminShop2.nm.perCard")}</span>
              <div className="as2-num-grid is-2">
                <NumBox label={t("adminShop2.nm.flips")} value={s.flips} onChange={(v) => set({ flips: Math.min(v, s.cards) })} min={1} max={12} />
                <NumBox label={t("adminShop2.nm.perNight")} value={s.keepMax} onChange={(v) => set({ keepMax: Math.min(v, s.flips) })} min={1} max={12} />
              </div>
            </div>
            <div className="as2-nm-box">
              <span className="as2-cap">{t("adminShop2.nm.who")}</span>
              <div className="as2-num-grid is-2">
                <NumBox label={t("adminShop2.nm.accountDays")} value={s.eligibility.minAccountDays} unit={t("adminShop2.unit.days")} onChange={(v) => set({ eligibility: { ...s.eligibility, minAccountDays: v } })} max={3650} />
                <label className="as2-numbox as2-nm-prem">
                  <small>{t("adminShop2.nm.premiumOnly")}</small>
                  <Switch checked={Boolean(s.eligibility.premiumOnly)} onChange={(v) => set({ eligibility: { ...s.eligibility, premiumOnly: v } })} label={t("adminShop2.nm.premiumOnly")} />
                </label>
              </div>
              <small className="as2-muted tnum">{t("adminShop2.nm.eligible", { n: f.n(pv?.eligibleUsers ?? data.eligibleCount ?? 0) })}</small>
              {changedPaths(s.eligibility, saved.eligibility).length ? <small className="as2-hint is-amber">{t("adminShop2.nm.eligibleNote")}</small> : null}
            </div>
          </div>

          <div className="as2-nm-box as2-nm-pv">
            <div className="as2-nm-bh">
              <span className="as2-cap">{t("adminShop2.nm.preview")}</span>
              {sample ? <span className="as2-muted">{t("adminShop2.nm.sample", { user: `@${sample.username}`, n: Object.values(flipped).filter(Boolean).length })}</span> : null}
              <Seg
                size="sm"
                value={device}
                onChange={setDevice}
                label={t("adminShop2.preview.device")}
                options={[
                  { id: "desktop", label: <Monitor size={14} aria-label={t("adminShop2.preview.desktop")} /> },
                  { id: "phone", label: <Smartphone size={14} aria-label={t("adminShop2.preview.phone")} /> },
                ]}
              />
            </div>
            <div className={`as2-nm-cards is-${device}`} style={{ "--n": Math.min(s.cards, Math.max(cards.length, s.cards)) }}>
              {Array.from({ length: s.cards }, (_, i) => {
                const c = cards[i % Math.max(1, cards.length)];
                const on = Boolean(flipped[i]);
                return (
                  <button key={i} type="button" className={`as2-nmc${on ? " is-flipped" : ""}`} onClick={() => setFlipped((x) => ({ ...x, [i]: !x[i] }))} aria-pressed={on} aria-label={t("adminShop2.nm.flip")}>
                    <span className="as2-nmc-in">
                      <span className="as2-nmc-back">
                        <Moon size={26} />
                      </span>
                      <span className="as2-nmc-front">
                        {c ? <Thumb item={c.item} size={46} /> : null}
                        <b className="as2-nmc-off tnum">−%{c?.discount ?? s.discountMin}</b>
                        <Coin value={c ? c.price || Math.round((c.item?.price_descoin || 0) * (1 - (c.discount || 0) / 100)) : 0} size="sm" />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="as2-nm-pvf">
              <span>
                {t("adminShop2.nm.closesIn")} <b className="tnum">{closesIn ? clock(closesIn - now) : "–"}</b>
              </span>
              <span className="as2-muted">{t("adminShop2.nm.vanish")}</span>
            </div>
          </div>

          <div className="as2-nm-fc">
            <Pill tone="violet">{t("adminShop2.nm.forecast")}</Pill>
            <span>
              {t("adminShop2.nm.fcJoin")} <b className="tnum">{data.forecast?.participants == null ? "–" : f.n(data.forecast.participants)}</b>
            </span>
            <span>
              {t("adminShop2.nm.fcRevenue")} <b className="tnum">{data.forecast?.revenue == null ? "–" : `${f.c(data.forecast.revenue)} D`}</b>
            </span>
            {data.forecast?.purchases != null ? (
              <span>
                {t("adminShop2.nm.fcBuys")} <b className="tnum">{f.n(data.forecast.purchases)}</b>
              </span>
            ) : null}
            {!data.forecast?.basis ? <span className="as2-muted">{t("adminShop2.nm.fcNoBasis")}</span> : null}
          </div>

          <div className="as2-nm-box">
            <div className="as2-nm-bh">
              <span className="as2-cap">{t("adminShop2.nm.past")}</span>
              <button type="button" className="as2-link as2-ml" onClick={() => setFullReport((v) => !v)}>
                {fullReport ? t("adminShop2.nm.lessReport") : t("adminShop2.nm.fullReport")}
              </button>
            </div>
            <table className="as2-nm-tbl">
              <thead>
                <tr>
                  <th>{t("adminShop2.nm.col.night")}</th>
                  <th>{t("adminShop2.nm.col.joined")}</th>
                  <th>{t("adminShop2.nm.col.flipped")}</th>
                  <th>{t("adminShop2.nm.col.buy")}</th>
                  <th>{t("adminShop2.nm.col.revenue")}</th>
                  <th>{t("adminShop2.nm.col.avg")}</th>
                </tr>
              </thead>
              <tbody>
                {!(data.past || []).length ? (
                  <tr>
                    <td colSpan={6} className="as2-muted">{t("adminShop2.nm.noPast")}</td>
                  </tr>
                ) : null}
                {(data.past || []).slice(0, fullReport ? 20 : 3).map((p) => (
                  <tr key={p.id || p.day}>
                    <td>{fdt(new Date(Date.parse(`${p.day}T19:00:00Z`)).toISOString(), locale, { weekday: "short", day: "numeric", month: "short" })}</td>
                    <td className="tnum">{f.n(p.participants)}</td>
                    <td className="tnum">{f.n(p.flips)}</td>
                    <td className="tnum">{f.p(p.buyPct, 0)}</td>
                    <td className="tnum">{f.c(p.revenue)}</td>
                    <td className="tnum">{p.avgDiscount == null ? "–" : f.p(p.avgDiscount, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <NightConfirm
        kind={confirm}
        onClose={() => setConfirm(null)}
        upcoming={data?.upcoming}
        onDone={(kind, res) => {
          setConfirm(null);
          notify(t(kind === "open" ? "adminShop2.toast.nightOpened" : "adminShop2.toast.weekSkipped", { n: res?.skipped ?? 0 }), kind === "open" && res?.id ? { undo: () => shop2Api.undoNightOpen(res.id).then(onSaved).catch(fail), ms: 5 * 60000 } : {});
          onSaved?.();
        }}
        fail={fail}
      />
    </Drawer>
  );
}

function NightConfirm({ kind, upcoming, onClose, onDone, fail }) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind) {
      setReason("");
      setMinutes(60);
    }
  }, [kind]);
  const go = async () => {
    setBusy(true);
    try {
      const res = kind === "open" ? await shop2Api.openNightNow(reason.trim(), minutes) : await shop2Api.skipWeek(reason.trim(), upcoming);
      onDone(kind, res);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={Boolean(kind)}
      onClose={onClose}
      busy={busy}
      icon={kind === "open" ? Zap : Pause}
      tone={kind === "open" ? "amber" : "red"}
      title={t(kind === "open" ? "adminShop2.nm.openTitle" : "adminShop2.nm.skipTitle")}
      subtitle={t(kind === "open" ? "adminShop2.nm.openSub" : "adminShop2.nm.skipSub")}
      width={520}
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className={`as2-btn ${kind === "open" ? "is-amber" : "is-danger"}`} onClick={go} disabled={busy || !reasonOk(reason)} data-testid="as2-night-confirm">
            {t(kind === "open" ? "adminShop2.nm.openGo" : "adminShop2.nm.skipGo")}
          </button>
        </>
      }
    >
      {kind === "open" ? (
        <div className="as2-num-grid">
          <NumBox label={t("adminShop2.nm.openFor")} value={minutes} unit={t("adminShop2.unit.min")} onChange={setMinutes} min={60} max={720} step={60} />
        </div>
      ) : null}
      <ReasonField value={reason} onChange={setReason} autoFocus />
    </Dialog>
  );
}
