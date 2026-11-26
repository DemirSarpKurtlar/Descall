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
        <span className="tile ic"><Icon name="link" /><span className={`bd ${forceBadge || (job.targets.every((t) => t.textSent || t.status === "sent" || t.status === "scheduled") ? "ok" : "wait")}`}><Icon name={forceBadge === "wait" ? "clock" : "check"} /></span></span>
      ) : null}
      <small>{note}</small>
    </div>
  );
}

export default function ShareRun({ job, setJob, host, tx, intl, now, timeText, scheduleText, index, say, variant }) {
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

  const itemsText = tx("items", { count: Math.max(1, s.itemCount) });
  const chatsText = tx("chats", { count: s.targetCount });
  const reasonText = (r) => tx(`reason.${r || "failed"}`);
  const entryOf = (t) => index.get(t.conv) || { ...t, id: t.conv.split(":")[1] };
  const label = (t) => (t.kind === "channel" ? `#${t.name}` : t.name);

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
      if (r.failed) say(tx("undone.failed"));
    } finally {
      setBusy(false);
    }
  };
  const open = (t) => host.openApp(M.deepLinkFor(t ? entryOf(t) : entryOf(job.targets[0])));

  const nav = (title, sub, left, right) => (
    <div className="shs-nav">
      {left || <span style={{ width: 60 }} />}
      <div className="shs-title"><span className="tl">{title}</span>{sub ? <small>{sub}</small> : null}</div>
      {right || <span style={{ width: 60 }} />}
    </div>
  );

  const rowsBlock = (renderLine, withOpen = false, withRetry = false) => (
    <div className="shs-grp">
      {job.targets.map((t) => {
        const line = renderLine(t);
        return (
          <div key={t.conv} className="shs-row dense">
            <Avatar entry={entryOf(t)} size={36} />
            <span className="shs-rt">
              <b>{label(t)}</b>
              {line}
            </span>
            {withOpen && (t.status === "sent" || t.status === "scheduled") ? (
              <button type="button" className="shs-mini" onClick={() => open(t)}>{tx("sent.open")}<Icon name="chevR" /></button>
            ) : null}
            {withRetry && (t.status === "failed" || t.status === "partial") && t.reason !== "cancelled" ? (
              <button type="button" className="shs-mini p" disabled={busy} onClick={retry}><Icon name="refresh" />{tx("partial.retryOne")}</button>
            ) : null}
          </div>
        );
      })}
    </div>
  );

  if (s.phase === "sending") {
    const stats = s.speed > 0 && s.eta != null
      ? tx("run.stats", { sent: M.formatBytes(s.sentBytes, intl), total: M.formatBytes(s.totalBytes, intl), speed: M.formatBytes(s.speed, intl), eta: s.eta })
      : tx("run.statsShort", { sent: M.formatBytes(s.sentBytes, intl), total: M.formatBytes(s.totalBytes, intl) });
    return (
      <div className="shs-run">
        {nav(tx("run.title"), tx("run.sub", { items: itemsText, chats: chatsText }), host.canBackground ? <button type="button" className="shs-lnk" onClick={() => host.finish()}>{tx("hide")}</button> : null)}
        <div className="shs-body">
          <div className="shs-hero">
            <Ring p={s.percent / 100} size={72} text={intl.startsWith("tr") ? `%${s.percent}` : `${s.percent}%`} fs={18} />
            <span className="shs-rt"><b>{tx("run.hero", { count: s.targetCount })}</b><small className="shs-tnum">{stats}</small></span>
          </div>
          {job.items.length ? <Tiles job={job} note={tx("run.uploaded", { done: s.uploaded, count: s.itemCount })} /> : null}
          {rowsBlock((t) => {
            if (t.status === "sent" || t.status === "scheduled") return <small className="shs-stline ok"><Icon name="check" />{t.status === "scheduled" ? tx("scheduled.row", { time: scheduleText(job.sendAt || now()) }) : tx("sent.delivered", { time: timeText(t.at || now()) })}</small>;
            const p = M.targetProgress(job, t.conv);
            if (t.status === "queued" && p === 0) return (<><small className="shs-stline"><Icon name="clock" />{tx("run.queued")}</small><div className="shs-bar"><span style={{ width: "0%" }} /></div></>);
            return (<><small className="shs-stline b">{t.status === "sending" && p >= 80 ? tx("run.sending") : tx("run.uploading", { percent: p })}</small><div className="shs-bar"><span style={{ width: `${p}%` }} /></div></>);
          })}
          {host.canBackground ? (
            <div className="shs-bnr i2"><Icon name="info" /><span><b>{tx("run.canClose")}</b>{tx("run.canCloseBody")}</span></div>
          ) : null}
        </div>
        <div className="shs-actions">
          {host.canBackground ? <button type="button" className="shs-cta" onClick={() => host.finish()}>{tx("run.background")}</button> : null}
          <button type="button" className="shs-btn2 dz" onClick={() => host.cancel()}><Icon name="x" />{tx("run.stop")}</button>
        </div>
      </div>
    );
  }

  if (s.phase === "sent" || s.phase === "scheduled") {
    const scheduled = s.phase === "scheduled";
    const slowLater = job.targets.some((t) => t.status === "sent" && t.scheduledIds.length);
    return (
      <div className="shs-run">
        {nav(tx(scheduled ? "scheduled.title" : "sent.title"), null, null, <button type="button" className="shs-lnk r b" onClick={() => host.finish()}>{tx("done")}</button>)}
        <div className="shs-body">
          <div className="shs-hero">
            <span className={`shs-bigic ${scheduled ? "b" : "ok"}`}><Icon name={scheduled ? "clock" : "check"} /></span>
            <span className="shs-rt">
              <b>{tx(scheduled ? "scheduled.hero" : "sent.hero", { count: s.done })}</b>
              <small>{scheduled ? tx("scheduled.sub", { when: scheduleText(job.sendAt) }) : tx("sent.sub", { items: itemsText, size: M.formatBytes(s.totalBytes, intl), seconds: s.seconds || 1 })}</small>
            </span>
          </div>
          {job.items.length ? <Tiles job={job} note={tx("sent.allArrived")} forceBadge={scheduled ? null : "ok"} /> : null}
          {s.undoLeft > 0 && !job.undone ? (
            <div className="shs-undo">
              <Ring p={s.undoLeft / M.UNDO_SECONDS} size={38} text={String(s.undoLeft)} fs={13} color="#8FA6FF" />
              <span className="shs-rt"><b>{tx("undo.title")}</b><small>{tx(scheduled ? "undo.bodyScheduled" : "undo.body", { seconds: s.undoLeft })}</small></span>
              <button type="button" className="shs-mini p" disabled={busy} onClick={undo}><Icon name="undo" />{busy ? tx("undo.busy") : tx("undo.button")}</button>
            </div>
          ) : null}
          {rowsBlock((t) => (
            <small className="shs-stline ok"><Icon name="check" />
              {t.status === "scheduled" ? tx("scheduled.row", { time: scheduleText(job.sendAt) }) : slowLater && t.scheduledIds.length ? tx("slowRow", { time: timeText((t.at || now()) + 35000) }) : tx("sent.delivered", { time: timeText(t.at || now()) })}
            </small>
          ), true)}
        </div>
        <div className="shs-actions">
          <button type="button" className="shs-cta" onClick={() => open(null)}><Icon name="out" />{tx("sent.openInApp")}</button>
          <button type="button" className="shs-btn2" onClick={() => host.finish()}>{tx("done")}</button>
        </div>
      </div>
    );
  }

  if (s.phase === "partial") {
    const bad = job.targets.find((t) => t.status === "failed" || t.status === "partial");
    return (
      <div className="shs-run">
        {nav(tx("partial.title"), null, null, <button type="button" className="shs-lnk r" onClick={() => host.finish()}>{tx("close")}</button>)}
        <div className="shs-body">
          <div className="shs-hero">
            <span className="shs-bigic w"><Icon name="alert" /></span>
            <span className="shs-rt"><b>{tx("partial.hero", { done: s.done, count: s.targetCount })}</b><small>{tx("partial.sub", { name: bad ? label(bad) : "", reason: reasonText(bad?.reason) })}</small></span>
          </div>
          {job.items.length ? <Tiles job={job} note={tx("partial.itemsIn", { ok: s.itemsOk, count: s.itemCount })} /> : null}
          {rowsBlock((t) => {
            if (t.status === "sent" || t.status === "scheduled") return <small className="shs-stline ok"><Icon name="check" />{tx("sent.delivered", { time: timeText(t.at || now()) })}</small>;
            const n = t.failedItems.length;
            return <small className="shs-stline d"><Icon name="alert" />{n ? tx("partial.itemsFailed", { count: n, reason: reasonText(t.reason) }) : reasonText(t.reason)}</small>;
          }, false, true)}
          <div className="shs-bnr i2"><Icon name="info" /><span><b>{tx("partial.infoTitle")}</b>{tx("partial.infoBody")}</span></div>
        </div>
        <div className="shs-actions">
          <button type="button" className="shs-cta" disabled={busy} onClick={retry}><Icon name="refresh" />{tx("partial.retryFailed")}</button>
          <button type="button" className="shs-btn2" onClick={async () => setJob(await host.dropFailed(job))}>{tx("partial.dropFailed")}</button>
        </div>
      </div>
    );
  }

  if (s.phase === "waiting") {
    return (
      <div className="shs-run">
        {nav(tx("offline.title"), null, null, <button type="button" className="shs-lnk r" onClick={() => host.finish()}>{tx("close")}</button>)}
        <div className="shs-body">
          <div className="shs-hero">
            <span className="shs-bigic d"><Icon name="wifiOff" /></span>
            <span className="shs-rt"><b>{tx("offline.hero")}</b><small>{s.done ? tx("offline.subSome", { done: s.done, count: s.targetCount }) : tx("offline.subNone")}</small></span>
          </div>
          {job.items.length ? <Tiles job={job} note={tx("offline.kept")} forceBadge="wait" /> : null}
          <div className="shs-bnr i2"><Icon name="clock" /><span><b>{tx("offline.queuedTitle")}</b>{tx("offline.queuedBody", { items: itemsText, chats: chatsText })}</span></div>
          {rowsBlock((t) => (t.status === "sent" || t.status === "scheduled"
            ? <small className="shs-stline ok"><Icon name="check" />{tx("sent.delivered", { time: timeText(t.at || now()) })}</small>
            : <small className="shs-stline w"><Icon name="clock" />{tx("offline.row")}</small>))}
        </div>
        <div className="shs-actions">
          <button type="button" className="shs-cta" disabled={busy} onClick={() => host.retryNow(job)}><Icon name="refresh" />{tx("offline.retryNow")}</button>
          {host.canBackground ? <button type="button" className="shs-btn2" onClick={async () => { await host.saveDraft(job); say(tx("offline.draftSaved")); host.finish(); }}>{tx("offline.saveDraft")}</button> : null}
          <button type="button" className="shs-btn2 dz ghost" onClick={async () => { await host.remove(job); host.finish(); }}>{tx("offline.remove")}</button>
        </div>
      </div>
    );
  }

  // failed | cancelled | undone
  const undone = s.phase === "undone";
  const first = job.targets.find((t) => t.reason);
  return (
    <div className="shs-run">
      {nav(tx(undone ? "undone.title" : "failed.title"), null, null, <button type="button" className="shs-lnk r" onClick={() => host.finish()}>{tx("close")}</button>)}
      <div className="shs-body">
        <div className="shs-hero">
          <span className={`shs-bigic ${undone ? "b" : "d"}`}><Icon name={undone ? "undo" : "alert"} /></span>
          <span className="shs-rt"><b>{tx(undone ? "undone.hero" : "failed.hero")}</b><small>{undone ? tx("undone.sub") : reasonText(first?.reason)}</small></span>
        </div>
        {!undone ? rowsBlock((t) => <small className="shs-stline d"><Icon name="alert" />{reasonText(t.reason)}</small>) : null}
      </div>
      <div className="shs-actions">
        {!undone && first?.reason !== "signed_out" ? <button type="button" className="shs-cta" disabled={busy} onClick={retry}><Icon name="refresh" />{tx("retry")}</button> : null}
        <button type="button" className="shs-btn2" onClick={() => host.finish()}>{tx("close")}</button>
      </div>
    </div>
  );
}
