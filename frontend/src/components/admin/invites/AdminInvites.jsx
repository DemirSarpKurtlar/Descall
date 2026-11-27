/**
 * Yönetici Paneli > Genel > Davet ödülleri (growth phase 4, owner pick 4A, section 3):
 * Security Center style control board. Six numbers, the anomaly banner (review / ignore),
 * invite funnel with the "Ölçüm" targets, top inviters, channel scorecard, abuse shield,
 * versioned rules (editor + preview text), action log with undo, and the right-hand panel
 * of the selected inviter: risk, invitees with signals, grouped actions, and the revoke /
 * hold / pause dialogs with a required reason and the text the person will see. Ban always
 * goes through BanDialog. Backend: routes/adminInvites.js (section "invites").
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { adminRawFetch } from "../../../lib/adminStepUp";
import { apiBase } from "../../../lib/nodeRouting";
import { getToken } from "../../../lib/storage";
import { useLocale } from "../../../context/localeContextInstance.js";
import { useToast } from "../../../context/ToastContext";
import { nameVars, trPossessiveNumber } from "../../../lib/trCase.js";
import BanDialog from "../BanDialog.jsx";
import { Brand, Coin, Dc, Ico, PAvatar, Pill, Seg } from "../../invites/ui.jsx";
import { clockTime, fmtNum, isTr, pctLabel, pctText, relTime } from "../../invites/format.js";
import { bandTone, deltaText, funnelRows, logText, signalRows } from "./invitesAdminModel.js";
import "../../../styles/invites.css";

const RANGES = ["24h", "7d", "30d"];
const REASONS = ["same_device", "disposable_email", "fake_activity", "other"];

function api(path, opts = {}) {
  return adminFetch(path, { ...opts, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
}

export default function AdminInvites({ onOpenUser, socket }) {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [range, setRange] = useState("30d");
  const [sort, setSort] = useState("active");
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [selected, setSelected] = useState(null);
  const [panel, setPanel] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [banFor, setBanFor] = useState(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const d = await api(`/invites/overview?range=${range}&sort=${sort}`);
      if (n !== seq.current) return;
      setData(d);
      setState("ready");
      setSelected((cur) => cur || d.alert?.inviter?.id || d.top?.find((x) => x.band === "high")?.inviterId || d.top?.[0]?.inviterId || null);
    } catch (err) {
      if (n !== seq.current) return;
      setState(/migrat|PGRST|does not exist/i.test(String(err?.message)) ? "unavailable" : "error");
    }
  }, [range, sort]);

  const loadPanel = useCallback(async (id) => {
    if (!id) return setPanel(null);
    try {
      setPanel(await api(`/invites/inviter/${id}`));
    } catch {
      setPanel(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadPanel(selected);
  }, [selected, loadPanel]);

  // Live board: the backend pings the admin room on sign-ups, pays, holds and alerts.
  useEffect(() => {
    if (!socket) return undefined;
    let timer = null;
    const onPing = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void load();
        if (selected) void loadPanel(selected);
      }, 600);
    };
    socket.on?.("admin:invites", onPing);
    const poll = window.setInterval(onPing, 60000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(poll);
      socket.off?.("admin:invites", onPing);
    };
  }, [socket, load, loadPanel, selected]);

  const refresh = () => {
    void load();
    if (selected) void loadPanel(selected);
  };

  const run = async (fn, okText) => {
    try {
      const out = await fn();
      toast(okText || t("dvt.adm.done"), "success", out?.actionId ? { actionLabel: t("dvt.adm.undo"), onOpen: () => void undo(out.actionId), duration: 9000 } : null);
      refresh();
      return out;
    } catch (err) {
      toast(err?.message || t("dvt.adm.failed"), "error");
      return null;
    }
  };

  const undo = async (actionId) => {
    try {
      await api(`/invites/actions/${actionId}/undo`, { method: "POST", body: {} });
      toast(t("dvt.adm.undoDone"), "success");
      refresh();
    } catch (err) {
      toast(err?.code === "UNDO_EXPIRED" ? t("dvt.adm.undoExpired") : err?.message || t("dvt.adm.failed"), "error");
    }
  };

  const exportCsv = async () => {
    try {
      const res = await adminRawFetch(`${apiBase()}/api/admin/invites/export.csv?range=${range}`, { headers: { Authorization: `Bearer ${getToken() || ""}` } });
      if (!res.ok) throw new Error("export");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `davet-odulleri-${range}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {
      toast(t("dvt.adm.failed"), "error");
    }
  };

  if (state === "loading" && !data) return <div className="dvt-adm"><div className="dvt-skel" role="status">{t("dvt.loading")}</div></div>;
  if ((state === "error" || state === "unavailable") && !data) {
    return (
      <div className="dvt-adm">
        <div className="dvt-errorbox" role="alert">
          <Ico name="alert" />
          <span>{state === "unavailable" ? t("dvt.adm.unavailable") : t("dvt.adm.loadError")}</span>
          <button type="button" className="dvt-btn p sm" onClick={() => void load()}>{t("dvt.retry")}</button>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const rangeLabel = t(`dvt.adm.r${range}`);
  return (
    <div className={`dvt-adm ${panel ? "has-panel" : ""}`} data-testid="dvt-admin">
      <div className="dvt-adm-main">
        <div className="dvt-ahd">
          <div className="dvt-col">
            <span className="dvt-bc">{t("dvt.adm.crumb")} ›</span>
            <div className="dvt-row">
              <h2>{t("dvt.adm.title")}</h2>
              <span className="dvt-live">{t("dvt.adm.live")}</span>
            </div>
          </div>
          <span className="sp" />
          <Seg label={t("dvt.adm.title")} value={range} onChange={setRange} items={RANGES.map((r) => ({ id: r, label: t(`dvt.adm.r${r}`) }))} />
          <button type="button" className="dvt-btn sm" onClick={() => setRulesOpen(true)} data-testid="dvt-rules-btn">
            <Ico name="sliders" />
            {t("dvt.adm.rules")}
          </button>
          <button type="button" className="dvt-btn sm ic" onClick={exportCsv} aria-label={t("dvt.adm.export")} title={t("dvt.adm.export")}>
            <Ico name="dl" />
          </button>
        </div>

        <div className="dvt-kpis six">
          <AKpi icon="eye" label={t("dvt.adm.kOpens")} value={fmtNum(k.opens.value, locale)} sub={t("dvt.adm.kOpensSub", { delta: deltaText(k.opens.delta, locale), range: rangeLabel })} up={k.opens.delta > 0} />
          <AKpi icon="uplus" label={t("dvt.adm.kSignups")} value={fmtNum(k.signups.value, locale)} sub={t("dvt.adm.kSignupsSub", { pct: pctText(k.signups.rate, locale) })} />
          <AKpi icon="msg" label={t("dvt.adm.kFirst")} value={fmtNum(k.firstMessage.value, locale)} sub={t("dvt.adm.kFirstSub", { pct: pctText(k.firstMessage.rate, locale), base: pctText(k.firstMessage.baseline, locale) })} up />
          <AKpi icon="check" label={t("dvt.adm.kActive")} value={fmtNum(k.active.value, locale)} sub={t("dvt.adm.kActiveSub", { pct: pctText(k.active.rate, locale) })} up />
          <AKpi coin label={t("dvt.adm.kPaid")} value={fmtNum(k.paid.value, locale)} sub={t("dvt.adm.kPaidSub", { count: k.paid.count, a: k.paid.inviterReward, b: k.paid.inviteeReward })} />
          <AKpi icon="shield" label={t("dvt.adm.kHeld")} value={<>{fmtNum(k.held.value, locale)} <span className="mu4 slash">/ {k.held.inviters}</span></>} sub={t("dvt.adm.kHeldSub", { amount: fmtNum(k.held.protected, locale) })} amb={k.held.value > 0} dn />
        </div>

        {data.alert ? (
          <div className="dvt-gl amb dvt-row dvt-alert" role="status" data-testid="dvt-alert">
            <span className="dvt-ib wa"><Ico name="alert" /></span>
            <div className="sp">
              <b>{t("dvt.adm.alertLabel")} </b>
              <span className="mu">
                {t("dvt.adm.alertText", {
                  user: data.alert.inviter?.username || "?",
                  n: data.alert.signups,
                  factor: data.alert.factor || "?",
                  window: data.alert.windowMinutes % 60 === 0 ? t("dvt.adm.alertWinH", { n: data.alert.windowMinutes / 60 }) : t("dvt.adm.alertWinM", { n: data.alert.windowMinutes }),
                  dev: isTr(locale) ? trPossessiveNumber(data.alert.sameDevice) : data.alert.sameDevice,
                })}
              </span>
            </div>
            <button type="button" className="dvt-btn sm p" onClick={() => { setSelected(data.alert.inviter?.id); void api(`/invites/alerts/${data.alert.id}`, { method: "POST", body: { decision: "review" } }).then(refresh).catch(() => {}); }}>
              {t("dvt.adm.review")}
            </button>
            <button type="button" className="dvt-btn sm g" onClick={() => void run(() => api(`/invites/alerts/${data.alert.id}`, { method: "POST", body: { decision: "ignore" } }))}>
              {t("dvt.adm.ignore")}
            </button>
          </div>
        ) : null}

        <div className="dvt-adm-grid">
          <div className="dvt-col dvt-gap">
            <Funnel data={data} t={t} locale={locale} />
            <section className="dvt-gl dvt-card">
              <div className="dvt-h">
                <Ico name="trophy" className="gdt" />
                {t("dvt.adm.top")}
                <span className="r">
                  <Seg label={t("dvt.adm.top")} value={sort} onChange={setSort} items={[{ id: "active", label: t("dvt.adm.sortActive") }, { id: "signups", label: t("dvt.adm.sortSignups") }]} />
                </span>
              </div>
              <div className="dvt-tbl" role="table">
                <div className="dvt-tr th top" role="row">
                  <span>{t("dvt.adm.cRank")}</span>
                  <span>{t("dvt.adm.cInviter")}</span>
                  <span>{t("dvt.adm.cOpens")}</span>
                  <span>{t("dvt.adm.cSignups")}</span>
                  <span>{t("dvt.adm.cActive")}</span>
                  <span>{t("dvt.adm.cReturn")}</span>
                  <span>{t("dvt.adm.cRisk")}</span>
                </div>
                {!data.top.length ? <div className="dvt-empty"><span>{t("dvt.adm.noData")}</span></div> : null}
                {data.top.map((r, i) => (
                  <button key={r.inviterId} type="button" className={`dvt-tr top ${selected === r.inviterId ? "sel" : ""}`} role="row" onClick={() => setSelected(r.inviterId)} data-testid="dvt-top-row">
                    <span className="mu4 num">{i + 1}</span>
                    <span className="nm">
                      <PAvatar user={r.user} size={22} />
                      <span className="ell"><b>{r.user?.displayName || r.user?.username || "?"}</b></span>
                    </span>
                    <span className="num">{fmtNum(r.opens, locale)}</span>
                    <span className="num">{fmtNum(r.signups, locale)}</span>
                    <span className={`num ${r.band === "high" ? "dgt" : "okt"}`}>{fmtNum(r.active, locale)}</span>
                    <span className={`num ${r.band === "high" ? "dgt" : ""}`}>{pctLabel(r.returnRate, locale)}</span>
                    <span><Pill tone={bandTone(r.band)}>{t(`dvt.adm.band${r.band[0].toUpperCase()}${r.band.slice(1)}`)} {r.risk}</Pill></span>
                  </button>
                ))}
              </div>
            </section>
            <section className="dvt-gl dvt-card">
              <div className="dvt-h">
                <Ico name="share" />
                {t("dvt.adm.channels")}
                <small className="mu">{t("dvt.adm.channelsSub")}</small>
              </div>
              {data.channels.map((c) => {
                const max = Math.max(1, ...data.channels.map((x) => x.opens));
                return (
                  <div key={c.channel} className="dvt-row dvt-chrow">
                    <span className={`dvt-t ${c.channel} sm`}>{["wa", "ig", "tt"].includes(c.channel) ? <Brand name={c.channel} /> : <Ico name={c.channel === "qr" ? "qr" : "link"} />}</span>
                    <span className="dvt-chname">{c.channel === "qr" || c.channel === "other" ? t("dvt.ch.qrOther") : t(`dvt.ch.${c.channel}`)}</span>
                    <div className={`dvt-bar sp ${c.channel === "wa" ? "ok" : ""}`}><i style={{ width: `${Math.round((c.opens / max) * 100)}%` }} /></div>
                    <span className="num">{fmtNum(c.opens, locale)} → {fmtNum(c.signups, locale)} → <span className="okt">{fmtNum(c.active, locale)}</span></span>
                  </div>
                );
              })}
              {!data.channels.length ? <div className="dvt-empty"><span>{t("dvt.adm.noData")}</span></div> : null}
            </section>
          </div>
          <div className="dvt-col dvt-gap">
            <section className="dvt-gl dvt-card">
              <div className="dvt-h">
                <Ico name="shieldc" className="okt" />
                {t("dvt.adm.shield")}
                <span className="r mu">{rangeLabel}</span>
              </div>
              {signalRows(data.shield).map((s) => (
                <div key={s.code} className="dvt-row dvt-shrow">
                  <span className={`dvt-ib ${s.tone}`}><Ico name={s.icon} /></span>
                  <span className="sp ell">{t(`dvt.adm.sh_${s.code}`, { s: data.rules.fastMessageSeconds })}</span>
                  <span className="num">{s.count}</span>
                  <Pill tone={s.actionTone}>{t(`dvt.adm.act${s.action[0].toUpperCase()}${s.action.slice(1)}`)}</Pill>
                </div>
              ))}
            </section>
            <section className="dvt-gl dvt-card">
              <div className="dvt-h">
                <Ico name="gift" className="brt" />
                {t("dvt.adm.rulesCard")}
                <span className="r"><Pill tone="tl">{t("dvt.adm.rulesLive", { v: data.rules.version })}</Pill></span>
              </div>
              <dl className="dvt-kv">
                <dt>{t("dvt.adm.rAmounts")}</dt>
                <dd><span className="dvt-dc"><Coin />{data.rules.inviterReward} / {data.rules.inviteeReward}</span></dd>
                <dt>{t("dvt.adm.rCondition")}</dt>
                <dd>{data.rules.requireFirstMessage ? t("dvt.adm.rConditionValue") : t("dvt.adm.rConditionReturn")}</dd>
                <dt>{t("dvt.adm.rMonthly")}</dt>
                <dd>{data.rules.monthlyCap}</dd>
                <dt>{t("dvt.adm.rAge")}</dt>
                <dd>{t("dvt.adm.rAgeValue", { n: data.rules.minInviterAgeDays })}</dd>
                <dt>{t("dvt.adm.rMilestones")}</dt>
                <dd>{data.rules.milestones.map((m) => m.at).join(" · ")}</dd>
              </dl>
              <div className="dvt-row dvt-rprev">
                <span className="dvt-cap">{t("dvt.adm.rPreview")}</span>
                <span className="sp">{t("dvt.adm.rPreviewText", { a: data.rules.inviterReward, b: data.rules.inviteeReward })}</span>
                <Ico name="device" className="mu4" />
              </div>
            </section>
            <section className="dvt-gl dvt-card">
              <div className="dvt-h">
                <Ico name="list" />
                {t("dvt.adm.log")}
                <button type="button" className="r dvt-link brt" onClick={() => setLogOpen(true)}>{t("dvt.adm.logAll")} ›</button>
              </div>
              <LogList lines={data.log} t={t} locale={locale} onUndo={undo} />
            </section>
          </div>
        </div>
      </div>

      {panel ? (
        <InviterPanel
          panel={panel}
          t={t}
          locale={locale}
          onClose={() => { setSelected(null); setPanel(null); }}
          onAction={(kind) => setDialog({ kind })}
          onRelease={() => void run(() => api(`/invites/inviter/${panel.user.id}/release`, { method: "POST", body: {} }))}
          onResume={() => void run(() => api(`/invites/inviter/${panel.user.id}/pause`, { method: "POST", body: { paused: false } }))}
          onDossier={() => onOpenUser?.(panel.user.id)}
          onBan={() => setBanFor(panel.user)}
          onUndo={undo}
        />
      ) : (
        <aside className="dvt-adm-panel dvt-empty"><span>{t("dvt.adm.pickHint")}</span></aside>
      )}

      {dialog && panel ? (
        <ActionDialog
          kind={dialog.kind}
          panel={panel}
          t={t}
          locale={locale}
          onClose={() => setDialog(null)}
          onConfirm={async (body) => {
            const path = dialog.kind === "revoke" ? "revoke" : dialog.kind === "hold" ? "hold" : "pause";
            const out = await run(() => api(`/invites/inviter/${panel.user.id}/${path}`, { method: "POST", body }));
            if (out) setDialog(null);
          }}
        />
      ) : null}

      {rulesOpen ? <RulesDialog rules={data.rules} t={t} onClose={() => setRulesOpen(false)} onSaved={() => { setRulesOpen(false); refresh(); }} onUndo={undo} /> : null}
      {logOpen ? <LogDialog t={t} locale={locale} onClose={() => setLogOpen(false)} onUndo={undo} /> : null}

      <BanDialog
        open={Boolean(banFor)}
        target={banFor ? { id: banFor.id, username: banFor.username, displayName: banFor.displayName, avatarUrl: banFor.avatarUrl } : null}
        onClose={() => setBanFor(null)}
        onBanned={() => { setBanFor(null); refresh(); }}
      />
    </div>
  );
}

function AKpi({ icon, coin, label, value, sub, up, dn, amb }) {
  return (
    <div className={`dvt-kp dvt-gl ${amb ? "amb" : ""}`.trim()}>
      <small>{coin ? <Coin /> : <Ico name={icon} />}{label}</small>
      <b>{value}</b>
      <em className={`blk ${up ? "up" : ""} ${dn && amb ? "wat" : ""}`.trim()}>{sub}</em>
    </div>
  );
}

function Funnel({ data, t, locale }) {
  const rows = funnelRows(data.funnel);
  const max = Math.max(1, rows[0]?.value || 0);
  const m = data.measurement;
  return (
    <section className="dvt-gl dvt-card">
      <div className="dvt-h">
        <Ico name="filter" />
        {t("dvt.adm.funnel")}
        <small className="mu">{t(`dvt.adm.r${data.range}`)}</small>
        <span className="r"><Pill>{t("dvt.adm.baseline", { pct: pctText(data.kpis.firstMessage.baseline, locale) })}</Pill></span>
      </div>
      <div className="dvt-col dvt-funnel">
        {rows.map((r) => (
          <div key={r.key} className="dvt-row dvt-frow">
            <span className="dvt-flabel">{t(`dvt.adm.${r.label}`)}</span>
            <div className="dvt-fbar"><i className={r.tone} style={{ width: `${Math.max(3, Math.round((r.value / max) * 100))}%` }} /></div>
            <span className="num dvt-fval">{fmtNum(r.value, locale)}</span>
            <small className={`dvt-frate ${r.rateTone}`}>{r.rateKey ? t(`dvt.adm.${r.rateKey}`, { pct: pctText(r.rate, locale), n: r.extra }) : pctLabel(100, locale)}</small>
          </div>
        ))}
      </div>
      <div className="dvt-olc">
        <Ico name="target" />
        <div className="dvt-col sp" style={{ gap: 4 }}>
          <b>{t("dvt.adm.measure")}</b>
          <MeasureBar label={t("dvt.adm.mShare")} m={m.inviteShare} t={t} locale={locale} />
          <MeasureBar label={t("dvt.adm.mFirst")} m={m.invitedFirstMessage} t={t} locale={locale} />
        </div>
      </div>
    </section>
  );
}

function MeasureBar({ label, m, t, locale }) {
  const v = Number(m.value) || 0;
  return (
    <div className="dvt-col dvt-mbar">
      <div className="dvt-row small">
        <span className="sp">{label}</span>
        <b>{pctLabel(m.value, locale)}</b>
        <small className="mu">{t("dvt.adm.mStartTarget", { s: m.start, t: m.target })}</small>
      </div>
      <div className="dvt-bar ok dvt-mtrack">
        <i style={{ width: `${Math.min(100, v)}%` }} />
        <span className="dvt-mmark start" style={{ left: `${m.start}%` }} />
        <span className="dvt-mmark target" style={{ left: `${m.target}%` }} />
      </div>
    </div>
  );
}

function LogList({ lines, t, locale, onUndo }) {
  if (!lines?.length) return <p className="mu small">{t("dvt.adm.logEmpty")}</p>;
  return (
    <div className="dvt-col dvt-log">
      {lines.map((l) => (
        <div key={l.id} className="dvt-row dvt-logrow">
          <span className="dvt-mono mu4">{clockTime(l.at, locale)}</span>
          <span className="sp ell">
            <b>{l.kind === "paid" ? t("dvt.adm.l_paid") : l.system ? t("dvt.adm.logSystem") : l.actor}</b>{" "}
            <span className="mu">{logText(l, t, locale)}</span>
            {l.undone ? <span className="mu4"> · {t("dvt.adm.undone")}</span> : null}
          </span>
          {l.undoable && l.actionId ? (
            <button type="button" className="dvt-btn xs" onClick={() => onUndo(l.actionId)}>
              <Ico name="undo" />
              {t("dvt.adm.undo")}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function LogDialog({ t, locale, onClose, onUndo }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    api("/invites/log?limit=100").then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);
  return (
    <div className="dvt-modal-scrim" onClick={onClose} role="presentation">
      <div className="dvt-opq dvt-dialog wide" role="dialog" aria-modal="true" aria-label={t("dvt.adm.log")} onClick={(e) => e.stopPropagation()}>
        <div className="dvt-row">
          <div className="dvt-h sp"><Ico name="list" />{t("dvt.adm.log")}</div>
          <button type="button" className="dvt-btn ic g" onClick={onClose} aria-label={t("dvt.close")}><Ico name="x" /></button>
        </div>
        {items ? <LogList lines={items.map((i) => ({ ...i, actionId: i.id }))} t={t} locale={locale} onUndo={onUndo} /> : <div className="dvt-skel">{t("dvt.loading")}</div>}
      </div>
    </div>
  );
}

function InviterPanel({ panel, t, locale, onClose, onAction, onRelease, onResume, onDossier, onBan, onUndo }) {
  const [showAll, setShowAll] = useState(false);
  const u = panel.user;
  const nv = nameVars(u.displayName || u.username, locale);
  const r = panel.risk;
  const list = showAll ? panel.invitees : panel.invitees.slice(0, 4);
  const ageDays = Math.max(0, Math.round((Date.now() - new Date(u.createdAt).getTime()) / 86400000));
  const pendingN = panel.counts.pending;
  return (
    <aside className="dvt-adm-panel" aria-label={u.displayName || u.username} data-testid="dvt-panel">
      <div className="dvt-row">
        <PAvatar user={u} size={46} online={u.online} />
        <div className="dvt-col sp">
          <b className="dvt-pname ell">{u.displayName || u.username}</b>
          <small className="mu ell">@{u.username} · {t("dvt.adm.pAgeDays", { n: ageDays })}{u.country ? ` · ${u.country}` : ""}</small>
        </div>
        <button type="button" className="dvt-btn sm ic g" onClick={onClose} aria-label={t("dvt.close")}><Ico name="x" /></button>
      </div>
      <div className={`dvt-risk ${r.band}`}>
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="21" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="5" />
          <circle cx="26" cy="26" r="21" fill="none" className="arc" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(132 * r.score) / 100} 132`} transform="rotate(-90 26 26)" />
          <text x="26" y="31" textAnchor="middle">{r.score}</text>
        </svg>
        <div className="dvt-col sp">
          <b>{t(`dvt.adm.risk${r.band[0].toUpperCase()}${r.band.slice(1)}`)}</b>
          {r.cluster ? <small className="mu">{t("dvt.adm.pCluster", { n: r.cluster.size, label: r.cluster.label })}</small> : null}
          {r.disposable || r.fast ? (
            <small className="mu">
              {[r.disposable ? t("dvt.adm.pDisposable", { n: r.disposable }) : null, r.fast ? t("dvt.adm.pFast", { n: r.fast, s: r.fastestSeconds ?? "?" }) : null].filter(Boolean).join(" · ")}
            </small>
          ) : null}
          {!r.cluster && !r.disposable && !r.fast ? <small className="mu">{t("dvt.adm.pClean")}</small> : null}
        </div>
      </div>
      <div className="dvt-row dvt-pcounts">
        {[
          ["opens", "cOpensL", ""],
          ["signups", "cSignupsL", ""],
          ["firstMessage", "cFirstL", ""],
          ["active", "cActiveL", r.band === "high" ? "dgt" : "okt"],
          ["held", "cHeldL", "wat"],
        ].map(([key, label, tone]) => (
          <div key={key} className="dvt-col">
            <b className={`num ${tone}`}>{fmtNum(panel.counts[key], locale)}</b>
            <small className="mu">{t(`dvt.adm.${label}`)}</small>
          </div>
        ))}
      </div>
      {panel.paused ? <Pill tone="wa" icon="pause">{t("dvt.adm.pausedNote")}</Pill> : null}
      <div className="dvt-col dvt-gap6">
        <span className="dvt-cap">{t("dvt.adm.invitees", { n: panel.invitees.length })}</span>
        {list.map((i) => (
          <div key={i.id} className="dvt-row dvt-invrow">
            <PAvatar user={i.user} size={18} />
            <span className="sp ell">{i.user?.username || "?"}</span>
            {i.clean ? <Pill tone="ok">{t("dvt.adm.chClean")}</Pill> : null}
            {i.chips.map((c, n) => (
              <Pill key={n} tone={c.kind === "device" || c.kind === "tempmail" ? "dg" : c.kind === "fast" ? "wa" : ""}>
                {c.kind === "device" ? t("dvt.adm.chDevice", { label: c.label }) : c.kind === "fast" ? t("dvt.adm.chFast", { s: c.seconds ?? "?" }) : c.kind === "tempmail" ? t("dvt.adm.chTempmail") : c.kind === "subnet" ? t("dvt.adm.chSubnet") : t("dvt.adm.chInviterOnly")}
              </Pill>
            ))}
          </div>
        ))}
        {panel.invitees.length > 4 ? (
          <div className="dvt-row mu small">
            {showAll ? null : <>{t("dvt.adm.more", { n: panel.invitees.length - 4 })} · </>}
            <button type="button" className="dvt-link brt" onClick={() => setShowAll((v) => !v)}>{r.cluster ? t("dvt.adm.showCluster") : t("dvt.adm.showAll")}</button>
          </div>
        ) : null}
      </div>
      <div className="dvt-col dvt-gap6">
        <span className="dvt-cap">{t("dvt.adm.actions")}</span>
        <div className="dvt-row wrap">
          <button type="button" className="dvt-btn sm w" disabled={!pendingN} onClick={() => onAction("hold")}><Ico name="pause" />{t("dvt.adm.aHold", { n: pendingN })}</button>
          {panel.counts.held ? <button type="button" className="dvt-btn sm" onClick={onRelease}><Ico name="play" />{t("dvt.adm.aRelease", { n: panel.counts.held })}</button> : null}
          <button type="button" className="dvt-btn sm d" onClick={() => onAction("revoke")} data-testid="dvt-revoke-open"><Ico name="undo" />{t("dvt.adm.aRevoke")}</button>
          {panel.paused ? (
            <button type="button" className="dvt-btn sm" onClick={onResume}><Ico name="link" />{t("dvt.adm.aResume")}</button>
          ) : (
            <button type="button" className="dvt-btn sm" onClick={() => onAction("pause")}><Ico name="link" />{t("dvt.adm.aPause")}</button>
          )}
        </div>
        <div className="dvt-row wrap">
          <button type="button" className="dvt-btn sm" onClick={onDossier}><Ico name="file" />{t("dvt.adm.aDossier")}</button>
          <button type="button" className="dvt-btn sm d" onClick={onBan}><Ico name="ban" />{t("dvt.adm.aBan")}</button>
        </div>
      </div>
      {panel.actions?.some((a) => a.undoable) ? (
        <div className="dvt-col dvt-gap6">
          {panel.actions.filter((a) => a.undoable).slice(0, 3).map((a) => (
            <div key={a.id} className="dvt-row small">
              <span className="sp mu">{relTime(a.at, locale)} · {a.actor} · {a.kind}</span>
              <button type="button" className="dvt-btn xs" onClick={() => onUndo(a.id)}><Ico name="undo" />{t("dvt.adm.undo")}</button>
            </div>
          ))}
        </div>
      ) : null}
      <span className="sr-only">{nv.name}</span>
    </aside>
  );
}

function ActionDialog({ kind, panel, t, locale, onClose, onConfirm }) {
  const u = panel.user;
  const nv = nameVars(u.displayName || u.username, locale);
  const suggested = panel.suggested?.ids || [];
  const candidates = kind === "hold" ? panel.invitees.filter((i) => i.status === "pending").map((i) => i.id) : kind === "revoke" ? (suggested.length ? suggested : panel.invitees.filter((i) => ["paid", "pending", "held"].includes(i.status)).map((i) => i.id)) : [];
  const [ids] = useState(candidates);
  const [reason, setReason] = useState(kind === "pause" ? "same_device" : panel.risk.cluster ? "same_device" : "fake_activity");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(kind === "revoke");
  const [notifyInvitees, setNotifyInvitees] = useState(false);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = useMemo(() => panel.invitees.filter((i) => ids.includes(i.id)).reduce((s, i) => s + (i.paidAmount || 0), 0), [ids, panel.invitees]);
  const previewKind = kind === "revoke" ? "revokeInviter" : kind === "hold" ? "holdInviter" : "pausedInviter";

  useEffect(() => {
    let live = true;
    const tm = window.setTimeout(() => {
      api(`/invites/preview?inviterId=${u.id}&kind=${previewKind}&count=${ids.length}&amount=${amount}&reason=${reason}&note=${encodeURIComponent(note)}`)
        .then((d) => live && setPreview(d.text || ""))
        .catch(() => live && setPreview(""));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(tm);
    };
  }, [u.id, previewKind, ids.length, amount, reason, note]);

  const noteMissing = reason === "other" && !note.trim();
  const title = kind === "revoke" ? t("dvt.adm.revokeTitle", { n: ids.length }) : kind === "hold" ? t("dvt.adm.holdTitle", { n: ids.length }) : t("dvt.adm.pauseTitle");
  const submit = async () => {
    if (noteMissing || busy) return;
    setBusy(true);
    try {
      if (kind === "revoke") await onConfirm({ ids, reason, note, message: preview || null, notifyInviter: notify, notifyInvitees });
      else if (kind === "hold") await onConfirm({ ids, reason, note, notify, message: notify ? preview : null });
      else await onConfirm({ paused: true, reason, note, notify });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dvt-modal-scrim" onClick={onClose} role="presentation">
      <div className="dvt-opq dvt-dialog" role="dialog" aria-modal="true" aria-labelledby="dvt-ad-t" onClick={(e) => e.stopPropagation()} data-testid="dvt-action-dialog">
        <div className="dvt-row">
          <b id="dvt-ad-t" className="sp">{title}</b>
          {kind === "revoke" ? <Dc amount={-amount} tone="dgt" locale={locale} /> : null}
        </div>
        {kind === "pause" ? <p className="mu small">{t("dvt.adm.pauseBody")}</p> : null}
        <span className="dvt-cap">{t("dvt.adm.reasonReq")}</span>
        <div className="dvt-row wrap" role="radiogroup" aria-label={t("dvt.adm.reasonReq")}>
          {REASONS.map((r) => (
            <button key={r} type="button" role="radio" aria-checked={reason === r} className={`dvt-chip ${reason === r ? "on" : ""}`} onClick={() => setReason(r)}>
              {t(`dvt.adm.rs_${r}`)}
            </button>
          ))}
        </div>
        <label className={`dvt-fld ${noteMissing ? "bad" : ""}`}>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t("dvt.adm.notePh")} aria-label={t("dvt.adm.notePh")} />
        </label>
        {kind !== "pause" || notify ? (
          <>
            <span className="dvt-cap">{t("dvt.adm.userSees", nv)}</span>
            <div className="dvt-userpreview" data-testid="dvt-user-preview">{preview || "…"}</div>
          </>
        ) : null}
        <div className="dvt-row small">
          <Toggle on={notify} onChange={setNotify} label={t("dvt.adm.notify", nv)} />
          <span className="sp">{t("dvt.adm.notify", nv)}</span>
          {kind === "revoke" ? (
            <>
              <Toggle on={notifyInvitees} onChange={setNotifyInvitees} label={t("dvt.adm.notifyInvitees")} />
              <span>{t("dvt.adm.notifyInvitees")}</span>
            </>
          ) : null}
        </div>
        <div className="dvt-row">
          <button type="button" className="dvt-btn sm g sp" onClick={onClose}>{t("dvt.adm.cancel")}</button>
          <button type="button" className={`dvt-btn sm ${kind === "revoke" ? "dd" : kind === "hold" ? "w" : "p"}`} disabled={noteMissing || busy || (kind !== "pause" && !ids.length)} onClick={() => void submit()} data-testid="dvt-action-confirm">
            {kind === "revoke" ? (amount > 0 ? t("dvt.adm.confirmRevoke", { amount: fmtNum(amount, locale) }) : t("dvt.adm.confirmRevokeNoMoney")) : kind === "hold" ? t("dvt.adm.confirmHold") : t("dvt.adm.confirmPause")}
          </button>
        </div>
        <small className="mu4">{t("dvt.adm.footnote")}</small>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`dvt-tg ${on ? "on" : ""}`} onClick={() => onChange(!on)} />;
}

const NUM_FIELDS = [
  ["inviterReward", "fInviter"],
  ["inviteeReward", "fInvitee"],
  ["monthlyCap", "fMonthly"],
  ["minInviterAgeDays", "fAge"],
  ["returnAfterHours", "fReturnAfter"],
  ["returnWindowHours", "fWindow"],
  ["fastMessageSeconds", "fFast"],
];
const SIG_CODES = ["same_device", "same_subnet", "disposable_email", "fast_first_message", "inviter_only"];

function RulesDialog({ rules, t, onClose, onSaved, onUndo }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(rules)));
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState([]);
  useEffect(() => {
    api("/invites/rules").then((d) => setVersions(d.versions || [])).catch(() => {});
  }, []);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        rules: {
          ...Object.fromEntries(NUM_FIELDS.map(([k]) => [k, Number(draft[k])])),
          milestones: draft.milestones.map((m) => ({ at: Number(m.at), amount: Number(m.amount), kind: m.kind, itemId: m.itemId || null })),
          signals: { ...draft.signals, inviter_device: draft.signals.same_device },
        },
        note,
      };
      const out = await api("/invites/rules", { method: "PUT", body });
      if (out.unchanged) toast(t("dvt.adm.rulesUnchanged"), "info");
      else toast(t("dvt.adm.rulesSaved", { v: out.version }), "success", out.actionId ? { actionLabel: t("dvt.adm.undo"), onOpen: () => onUndo(out.actionId), duration: 9000 } : null);
      onSaved();
    } catch (e) {
      setErr(e?.field || "x");
      toast(e?.message || t("dvt.adm.failed"), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dvt-modal-scrim" onClick={onClose} role="presentation">
      <div className="dvt-opq dvt-dialog wide" role="dialog" aria-modal="true" aria-labelledby="dvt-rules-t" onClick={(e) => e.stopPropagation()} data-testid="dvt-rules-dialog">
        <div className="dvt-row">
          <div className="dvt-h sp" id="dvt-rules-t"><Ico name="sliders" />{t("dvt.adm.rulesTitle")}</div>
          <Pill tone="tl">{t("dvt.adm.rulesLive", { v: rules.version })}</Pill>
          <button type="button" className="dvt-btn ic g" onClick={onClose} aria-label={t("dvt.close")}><Ico name="x" /></button>
        </div>
        <div className="dvt-rgrid">
          {NUM_FIELDS.map(([k, label]) => (
            <label key={k} className="dvt-col dvt-rfield">
              <small className="mu">{t(`dvt.adm.${label}`)}</small>
              <span className={`dvt-fld ${err === k ? "bad" : ""}`}>
                <input type="number" inputMode="numeric" value={draft[k]} onChange={(e) => set(k, e.target.value)} />
              </span>
            </label>
          ))}
          {draft.milestones.map((m, i) => (
            <label key={i} className="dvt-col dvt-rfield">
              <small className="mu">{t("dvt.adm.fMilestone", { n: i + 1 })}</small>
              <span className="dvt-row">
                <span className="dvt-fld sp"><input type="number" value={m.at} onChange={(e) => set("milestones", draft.milestones.map((x, j) => (j === i ? { ...x, at: e.target.value } : x)))} aria-label={`${i + 1} at`} /></span>
                <span className="dvt-fld sp"><input type="number" value={m.amount} onChange={(e) => set("milestones", draft.milestones.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} aria-label={`${i + 1} amount`} /></span>
              </span>
            </label>
          ))}
        </div>
        <span className="dvt-cap">{t("dvt.adm.fSignals")}</span>
        <div className="dvt-col dvt-gap6">
          {SIG_CODES.map((c) => (
            <div key={c} className="dvt-row small">
              <span className="sp">{t(`dvt.adm.sh_${c}`, { s: draft.fastMessageSeconds })}</span>
              <Seg label={c} value={draft.signals[c]} onChange={(v) => set("signals", { ...draft.signals, [c]: v })} items={["none", "warn", "hold", "deny"].map((a) => ({ id: a, label: t(`dvt.adm.act${a[0].toUpperCase()}${a.slice(1)}`) }))} />
            </div>
          ))}
        </div>
        <label className="dvt-fld"><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t("dvt.adm.rulesNote")} aria-label={t("dvt.adm.rulesNote")} /></label>
        {versions.length ? (
          <div className="dvt-col dvt-gap6">
            <span className="dvt-cap">{t("dvt.adm.rulesVersions")}</span>
            {versions.slice(0, 5).map((v) => (
              <small key={v.version} className="mu">v{v.version} · {new Date(v.at).toLocaleString()}{v.note ? ` · ${v.note}` : ""}</small>
            ))}
          </div>
        ) : null}
        <div className="dvt-row">
          <button type="button" className="dvt-btn sm g sp" onClick={onClose}>{t("dvt.adm.cancel")}</button>
          <button type="button" className="dvt-btn sm p" disabled={busy} onClick={() => void save()}>{t("dvt.adm.rulesPublish", { v: rules.version + 1 })}</button>
        </div>
        <small className="mu4">{t("dvt.adm.footnote")}</small>
      </div>
    </div>
  );
}
