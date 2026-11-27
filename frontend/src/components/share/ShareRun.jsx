/**
 * After Gönder the share sheet turns into live progress and the result (draft A, step 4):
 * sending (ring, speed, per-item badges, per-chat bars), sent (10 s undo, open in Descall),
 * scheduled, partial (retry only what failed / keep the rest), offline queue (retry now,
 * save as draft, remove from queue), failed and undone.
 */
import { useEffect, useState } from "react";
import * as M from "../../lib/share/shareModel.js";
import { Icon } from "./shareIcons.jsx";
import { Avatar } from "./SharePage.jsx";

function Ring({ p, size = 40, text = "", fs = 12, color }) {
  const C = 2 * Math.PI * 15.5;
  return (
    <span className="shs-ringwrap" style={{ width: size, height: size }}>
      <svg className="shs-ring" viewBox="0 0 36 36" width={size} height={size} aria-hidden="true">
        <circle className="rb" cx="18" cy="18" r="15.5" />
        <circle className="rf" cx="18" cy="18" r="15.5" strokeDasharray={`${(Math.max(0, Math.min(1, p)) * C).toFixed(1)} ${C.toFixed(1)}`} style={color ? { stroke: color } : undefined} />
      </svg>
      <span style={{ fontSize: fs }} className="shs-tnum">{text}</span>
    </span>
  );
}

function Tiles({ job, note, forceBadge }) {
  return (
    <div className="shs-itm">
      {job.items.filter((it) => it.status !== "dropped").slice(0, 5).map((it) => {
        const badge = forceBadge || M.itemBadge(job, it.index);
        const pic = (it.kind === "image" || it.kind === "video") && it.thumb;
        return (
          <span key={it.index} className={`tile${pic ? "" : " ic"}`} style={pic ? { backgroundImage: `url("${it.thumb}")` } : undefined}>
            {pic ? null : <Icon name={it.kind === "video" ? "video" : it.kind === "image" ? "image" : "file"} />}
            <span className={`bd ${badge}`}><Icon name={badge === "ok" ? "check" : badge === "fail" ? "x" : "clock"} /></span>
          </span>
        );
      })}
      {job.text && /https?:\/\//.test(job.text) ? (
        <span className="tile ic"><Icon name="link" /><span className={`bd ${forceBadge || (job.targets.every((tg) => tg.textSent || tg.status === "sent" || tg.status === "scheduled") ? "ok" : "wait")}`}><Icon name={forceBadge === "wait" ? "clock" : "check"} /></span></span>
      ) : null}
      <small>{note}</small>
    </div>
  );
}

export default function ShareRun({ job, setJob, host, t, intl, now, timeText, scheduleText, index, say, variant }) {
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const s = M.summarizeJob(job, { now: now() });

  // Undo countdown and the speed line refresh.
  useEffect(() => {
    if (!(s.phase === "sending" || s.undoLeft > 0)) return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [s.phase, s.undoLeft]);
  void tick;

  const itemsText = t("shareSheet.items", { count: Math.max(1, s.itemCount) });
  const chatsText = t("shareSheet.chats", { count: s.targetCount });
  const reasonText = (r) => t(`shareSheet.reason.${r || "failed"}`);
  const entryOf = (tg) => index.get(tg.conv) || { ...tg, id: tg.conv.split(":")[1] };
  const label = (tg) => (tg.kind === "channel" ? `#${tg.name}` : tg.name);

  const retry = async () => {
    setBusy(true);
    try {
      const end = await host.retry(job, (j) => setJob(j));
      if (end) setJob(end);
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    try {
      const r = await host.undo(job);
      setJob(r.job);
      if (r.failed) say(t("shareSheet.undone.failed"));
    } finally {
      setBusy(false);
    }
  };
  const open = (tg) => host.openApp(M.deepLinkFor(tg ? entryOf(tg) : entryOf(job.targets[0])));

  const nav = (title, sub, left, right) => (
    <div className="shs-nav">
      {left || <span style={{ width: 60 }} />}
      <div className="shs-title"><span className="tl">{title}</span>{sub ? <small>{sub}</small> : null}</div>
      {right || <span style={{ width: 60 }} />}
    </div>
  );

  const rowsBlock = (renderLine, withOpen = false, withRetry = false) => (
    <div className="shs-grp">
      {job.targets.map((tg) => {
        const line = renderLine(tg);
        return (
          <div key={tg.conv} className="shs-row dense">
            <Avatar entry={entryOf(tg)} size={36} />
            <span className="shs-rt">
              <b>{label(tg)}</b>
              {line}
            </span>
            {withOpen && (tg.status === "sent" || tg.status === "scheduled") ? (
              <button type="button" className="shs-mini" onClick={() => open(tg)}>{t("shareSheet.sent.open")}<Icon name="chevR" /></button>
            ) : null}
            {withRetry && (tg.status === "failed" || tg.status === "partial") && tg.reason !== "cancelled" ? (
              <button type="button" className="shs-mini p" disabled={busy} onClick={retry}><Icon name="refresh" />{t("shareSheet.partial.retryOne")}</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  if (s.phase === "sending") {
    const stats = s.speed > 0 && s.eta != null
      ? t("shareSheet.run.stats", { sent: M.formatBytes(s.sentBytes, intl), total: M.formatBytes(s.totalBytes, intl), speed: M.formatBytes(s.speed, intl), eta: s.eta })
      : t("shareSheet.run.statsShort", { sent: M.formatBytes(s.sentBytes, intl), total: M.formatBytes(s.totalBytes, intl) });
    return (
      <div className="shs-run">
        {nav(t("shareSheet.run.title"), t("shareSheet.run.sub", { items: itemsText, chats: chatsText }), host.canBackground ? <button type="button" className="shs-lnk" onClick={() => host.finish()}>{t("shareSheet.hide")}</button> : null)}
        <div className="shs-body">
          <div className="shs-hero">
            <Ring p={s.percent / 100} size={72} text={intl.startsWith("tr") ? `%${s.percent}` : `${s.percent}%`} fs={18} />
            <span className="shs-rt"><b>{t("shareSheet.run.hero", { count: s.targetCount })}</b><small className="shs-tnum">{stats}</small></span>
          </div>
          {job.items.length ? <Tiles job={job} note={t("shareSheet.run.uploaded", { done: s.uploaded, count: s.itemCount })} /> : null}
          {rowsBlock((tg) => {
            if (tg.status === "sent" || tg.status === "scheduled") return <small className="shs-stline ok"><Icon name="check" />{tg.status === "scheduled" ? t("shareSheet.scheduled.row", { time: scheduleText(job.sendAt || now()) }) : t("shareSheet.sent.delivered", { time: timeText(tg.at || now()) })}</small>;
            const p = M.targetProgress(job, tg.conv);
            if (tg.status === "queued" && p === 0) return (<><small className="shs-stline"><Icon name="clock" />{t("shareSheet.run.queued")}</small><div className="shs-bar"><span style={{ width: "0%" }} /></div></>);
            return (<><small className="shs-stline b">{tg.status === "sending" && p >= 80 ? t("shareSheet.run.sending") : t("shareSheet.run.uploading", { percent: p })}</small><div className="shs-bar"><span style={{ width: `${p}%` }} /></div></>);
          })}
          {host.canBackground ? (
            <div className="shs-bnr i2"><Icon name="info" /><span><b>{t("shareSheet.run.canClose")}</b>{t("shareSheet.run.canCloseBody")}</span></div>
          ) : null}
        </div>
        <div className="shs-actions">
          {host.canBackground ? <button type="button" className="shs-cta" onClick={() => host.finish()}>{t("shareSheet.run.background")}</button> : null}
          <button type="button" className="shs-btn2 dz" onClick={() => host.cancel()}><Icon name="x" />{t("shareSheet.run.stop")}</button>
        </div>
      </div>
    );
  }

  if (s.phase === "sent" || s.phase === "scheduled") {
    const scheduled = s.phase === "scheduled";
    const slowLater = job.targets.some((tg) => tg.status === "sent" && tg.scheduledIds.length);
    return (
      <div className="shs-run">
        {nav(t(scheduled ? "shareSheet.scheduled.title" : "shareSheet.sent.title"), null, null, <button type="button" className="shs-lnk r b" onClick={() => host.finish()}>{t("shareSheet.done")}</button>)}
        <div className="shs-body">
          <div className="shs-hero">
            <span className={`shs-bigic ${scheduled ? "b" : "ok"}`}><Icon name={scheduled ? "clock" : "check"} /></span>
            <span className="shs-rt">
              <b>{t(scheduled ? "shareSheet.scheduled.hero" : "shareSheet.sent.hero", { count: s.done })}</b>
              <small>{scheduled ? t("shareSheet.scheduled.sub", { when: scheduleText(job.sendAt) }) : t("shareSheet.sent.sub", { items: itemsText, size: M.formatBytes(s.totalBytes, intl), seconds: s.seconds || 1 })}</small>
            </span>
          </div>
          {job.items.length ? <Tiles job={job} note={t("shareSheet.sent.allArrived")} forceBadge={scheduled ? null : "ok"} /> : null}
          {s.undoLeft > 0 && !job.undone ? (
            <div className="shs-undo">
              <Ring p={s.undoLeft / M.UNDO_SECONDS} size={38} text={String(s.undoLeft)} fs={13} color="#8FA6FF" />
              <span className="shs-rt"><b>{t("shareSheet.undo.title")}</b><small>{t(scheduled ? "shareSheet.undo.bodyScheduled" : "shareSheet.undo.body", { seconds: s.undoLeft })}</small></span>
              <button type="button" className="shs-mini p" disabled={busy} onClick={undo}><Icon name="undo" />{busy ? t("shareSheet.undo.busy") : t("shareSheet.undo.button")}</button>
            </div>
          ) : null}
          {rowsBlock((tg) => (
            <small className="shs-stline ok"><Icon name="check" />
              {tg.status === "scheduled" ? t("shareSheet.scheduled.row", { time: scheduleText(job.sendAt) }) : slowLater && tg.scheduledIds.length ? t("shareSheet.slowRow", { time: timeText((tg.at || now()) + 35000) }) : t("shareSheet.sent.delivered", { time: timeText(tg.at || now()) })}
            </small>
          ), true)}
        </div>
        <div className="shs-actions">
          <button type="button" className="shs-cta" onClick={() => open(null)}><Icon name="out" />{t("shareSheet.sent.openInApp")}</button>
          <button type="button" className="shs-btn2" onClick={() => host.finish()}>{t("shareSheet.done")}</button>
        </div>
      </div>
    );
  }

  if (s.phase === "partial") {
    const bad = job.targets.find((tg) => tg.status === "failed" || tg.status === "partial");
    return (
      <div className="shs-run">
        {nav(t("shareSheet.partial.title"), null, null, <button type="button" className="shs-lnk r" onClick={() => host.finish()}>{t("shareSheet.close")}</button>)}
        <div className="shs-body">
          <div className="shs-hero">
            <span className="shs-bigic w"><Icon name="alert" /></span>
            <span className="shs-rt"><b>{t("shareSheet.partial.hero", { done: s.done, count: s.targetCount })}</b><small>{t("shareSheet.partial.sub", { name: bad ? label(bad) : "", reason: reasonText(bad?.reason) })}</small></span>
          </div>
          {job.items.length ? <Tiles job={job} note={t("shareSheet.partial.itemsIn", { ok: s.itemsOk, count: s.itemCount })} /> : null}
          {rowsBlock((tg) => {
            if (tg.status === "sent" || tg.status === "scheduled") return <small className="shs-stline ok"><Icon name="check" />{t("shareSheet.sent.delivered", { time: timeText(tg.at || now()) })}</small>;
            const n = tg.failedItems.length;
            return <small className="shs-stline d"><Icon name="alert" />{n ? t("shareSheet.partial.itemsFailed", { count: n, reason: reasonText(tg.reason) }) : reasonText(tg.reason)}</small>;
          }, false, true)}
          <div className="shs-bnr i2"><Icon name="info" /><span><b>{t("shareSheet.partial.infoTitle")}</b>{t("shareSheet.partial.infoBody")}</span></div>
        </div>
        <div className="shs-actions">
          <button type="button" className="shs-cta" disabled={busy} onClick={retry}><Icon name="refresh" />{t("shareSheet.partial.retryFailed")}</button>
          <button type="button" className="shs-btn2" onClick={async () => setJob(await host.dropFailed(job))}>{t("shareSheet.partial.dropFailed")}</button>
        </div>
      </div>
    );
  }

  if (s.phase === "waiting") {
    return (
      <div className="shs-run">
        {nav(t("shareSheet.offline.title"), null, null, <button type="button" className="shs-lnk r" onClick={() => host.finish()}>{t("shareSheet.close")}</button>)}
        <div className="shs-body">
          <div className="shs-hero">
            <span className="shs-bigic d"><Icon name="wifiOff" /></span>
            <span className="shs-rt"><b>{t("shareSheet.offline.hero")}</b><small>{s.done ? t("shareSheet.offline.subSome", { done: s.done, count: s.targetCount }) : t("shareSheet.offline.subNone")}</small></span>
          </div>
          {job.items.length ? <Tiles job={job} note={t("shareSheet.offline.kept")} forceBadge="wait" /> : null}
          <div className="shs-bnr i2"><Icon name="clock" /><span><b>{t("shareSheet.offline.queuedTitle")}</b>{t("shareSheet.offline.queuedBody", { items: itemsText, chats: chatsText })}</span></div>
          {rowsBlock((tg) => (tg.status === "sent" || tg.status === "scheduled"
            ? <small className="shs-stline ok"><Icon name="check" />{t("shareSheet.sent.delivered", { time: timeText(tg.at || now()) })}</small>
            : <small className="shs-stline w"><Icon name="clock" />{t("shareSheet.offline.row")}</small>))}
        </div>
        <div className="shs-actions">
          <button type="button" className="shs-cta" disabled={busy} onClick={() => host.retryNow(job)}><Icon name="refresh" />{t("shareSheet.offline.retryNow")}</button>
          {host.canBackground ? <button type="button" className="shs-btn2" onClick={async () => { await host.saveDraft(job); say(t("shareSheet.offline.draftSaved")); host.finish(); }}>{t("shareSheet.offline.saveDraft")}</button> : null}
          <button type="button" className="shs-btn2 dz ghost" onClick={async () => { await host.remove(job); host.finish(); }}>{t("shareSheet.offline.remove")}</button>
        </div>
      </div>
    );
  }

  // failed | cancelled | undone
  const undone = s.phase === "undone";
  const first = job.targets.find((tg) => tg.reason);
  return (
    <div className="shs-run">
      {nav(t(undone ? "shareSheet.undone.title" : "shareSheet.failed.title"), null, null, <button type="button" className="shs-lnk r" onClick={() => host.finish()}>{t("shareSheet.close")}</button>)}
      <div className="shs-body">
        <div className="shs-hero">
          <span className={`shs-bigic ${undone ? "b" : "d"}`}><Icon name={undone ? "undo" : "alert"} /></span>
          <span className="shs-rt"><b>{t(undone ? "shareSheet.undone.hero" : "shareSheet.failed.hero")}</b><small>{undone ? t("shareSheet.undone.sub") : reasonText(first?.reason)}</small></span>
        </div>
        {!undone ? rowsBlock((tg) => <small className="shs-stline d"><Icon name="alert" />{reasonText(tg.reason)}</small>) : null}
      </div>
      <div className="shs-actions">
        {!undone && first?.reason !== "signed_out" ? <button type="button" className="shs-cta" disabled={busy} onClick={retry}><Icon name="refresh" />{t("shareSheet.retry")}</button> : null}
        <button type="button" className="shs-btn2" onClick={() => host.finish()}>{t("shareSheet.close")}</button>
      </div>
    </div>
  );
}
