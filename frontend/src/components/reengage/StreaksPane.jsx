import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT, useLocale } from "../../context/LocaleContext";
import { Avatar } from "../ui/Avatar";
import { Flame, Plus, Check, X, Search, Headphones, MessageCircle, Loader2, AlertTriangle, RefreshCw, BellRing, Coins } from "../ui/Icon.jsx";
import { streaksApi, notifyCenter } from "../../api/reengage";
import { filterBySearch } from "./notifyCenterModel.js";
import { taskTitle, taskSub, sharedSub, doneCount, ringPct } from "./streaksModel.js";
import "../../styles/reengage.css";

function Coin({ amount }) {
  return (
    <span className="rg-coin">
      <i aria-hidden="true">D</i>
      {amount}
    </span>
  );
}

function Face({ p, size = 30 }) {
  return <Avatar size={size} name={p?.name} user={{ id: p?.id, username: p?.username, avatarUrl: p?.avatarUrl, display_name: p?.name }} animate="never" frame={false} />;
}

function Ring({ value, pct }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <span className="rg-ring" aria-hidden="true">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={r} className="bg" />
        <circle cx="32" cy="32" r={r} className="fg" strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 32 32)" />
      </svg>
      <b>{value}</b>
    </span>
  );
}

function FriendPicker({ onPick, onClose, exclude, t }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState(null);
  useEffect(() => {
    let alive = true;
    notifyCenter
      .state()
      .then((s) => alive && setList((s.people || []).filter((p) => p.friend && !exclude.has(p.id))))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, [exclude]);
  const shown = filterBySearch(list || [], q);
  return createPortal(
    <div className="rg-sheet-wrap" role="dialog" aria-modal="true" aria-label={t("rg3.streaks.pickTitle")} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rg-sheet">
        <div className="rg-sheet-grab" aria-hidden="true" />
        <div className="rg-sheet-h">
          <b>{t("rg3.streaks.pickTitle")}</b>
          <button type="button" className="rg-icon-btn" onClick={onClose} aria-label={t("rg3.common.close")}>
            <X size={16} />
          </button>
        </div>
        <p className="rg-pop-sub">{t("rg3.streaks.pickSub")}</p>
        <label className="rg-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("rg3.center.search")} aria-label={t("rg3.center.search")} />
        </label>
        <div className="rg-sheet-list">
          {list == null ? (
            <Loader2 size={18} className="rg-spin" />
          ) : shown.length ? (
            shown.map((p) => (
              <button key={p.id} type="button" className="rg-prow" onClick={() => onPick(p)}>
                <Face p={p} size={34} />
                <span className="tx">
                  <b>{p.name}</b>
                  <small>@{p.username}</small>
                </span>
                <Plus size={16} />
              </button>
            ))
          ) : (
            <p className="rg-empty">{t("rg3.center.noMatch")}</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function StreaksPane({ me = null, onOpenDm = null }) {
  const t = useT();
  const { locale } = useLocale();
  const [state, setState] = useState(null);
  const [load, setLoad] = useState("loading");
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null); // { kind: "ok"|"err", text }
  const [picker, setPicker] = useState(false);
  const hostRef = useRef(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (!hostRef.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((e) => setWide((e[0]?.contentRect?.width || 0) >= 760));
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    streaksApi
      .state()
      .then((s) => {
        if (!alive) return;
        setState(s);
        setLoad(s?.ready === false ? "not_ready" : "ready");
      })
      .catch(() => alive && setLoad("failed"));
    return () => {
      alive = false;
    };
  }, [nonce]);

  // Live: a task paid, a shared day completed, a nudge, a new balance.
  useEffect(() => {
    const on = () => setNonce((n) => n + 1);
    window.addEventListener("descall:streaks-changed", on);
    return () => window.removeEventListener("descall:streaks-changed", on);
  }, []);

  const flash = useCallback((kind, text) => {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 4000);
  }, []);

  const errText = (e) => {
    const code = e?.code || e?.message;
    if (code === "quiet_hours") return t("rg3.streaks.errQuiet");
    if (code === "already_today") return t("rg3.streaks.errNudged");
    if (code === "already_wrote") return t("rg3.streaks.errWrote");
    if (code === "nudges_off") return t("rg3.streaks.errNudgesOff");
    if (code === "not_friends") return t("rg3.streaks.errFriends");
    if (code === "too_many") return t("rg3.streaks.errTooMany");
    if (e?.status === 503 || code === "not_ready") return t("rg3.errors.notReady");
    return t("rg3.errors.save");
  };

  const act = async (key, fn, okText) => {
    setBusy(key);
    try {
      await fn();
      if (okText) flash("ok", okText);
      setNonce((n) => n + 1);
    } catch (e) {
      flash("err", errText(e));
    } finally {
      setBusy(null);
    }
  };

  const exclude = useMemo(() => new Set((state?.shared || []).map((s) => s.peer?.id)), [state]);

  if (load === "loading" && !state) {
    return (
      <div className="rg-streaks" ref={hostRef} aria-busy="true">
        <div className="rg-skel split" />
      </div>
    );
  }
  if (load === "failed" && !state) {
    return (
      <div className="rg-streaks" ref={hostRef}>
        <div className="rg-state-card" role="alert">
          <AlertTriangle size={18} />
          <div>
            <b>{t("rg3.errors.loadTitle")}</b>
            <small>{t("rg3.errors.loadBody")}</small>
          </div>
          <button type="button" className="rg-btn" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw size={14} /> {t("rg3.common.retry")}
          </button>
        </div>
      </div>
    );
  }
  const personal = state?.personal;
  const tasks = state?.tasks || [];
  const shared = state?.shared || [];
  const fmtNum = (n) => new Intl.NumberFormat(locale).format(n || 0);

  const personalCard = (
    <div className="rg-card rg-mine">
      <Ring value={personal?.streak || 0} pct={ringPct(personal?.streak || 0)} />
      <div className="tx">
        <b>{t("rg3.streaks.mine", { count: personal?.streak || 0 })}</b>
        {personal?.claimedToday ? (
          <small>
            {t("rg3.streaks.claimed")} <Coin amount={personal.todayReward || 0} />
          </small>
        ) : (
          <small>{t("rg3.streaks.claimHint")}</small>
        )}
      </div>
      {personal && !personal.claimedToday ? (
        <button type="button" className="rg-btn primary" disabled={busy === "claim"} onClick={() => act("claim", () => streaksApi.claimDaily(), t("rg3.streaks.claimedNow", { amount: personal.claimAmount }))}>
          {busy === "claim" ? <Loader2 size={14} className="rg-spin" /> : <Coins size={14} />} {t("rg3.streaks.claim", { amount: personal.claimAmount })}
        </button>
      ) : null}
    </div>
  );

  const sharedCard = (
    <div className="rg-card">
      <div className="rg-card-h">
        <b>{t("rg3.streaks.shared")}</b>
        <button type="button" className="rg-mini" onClick={() => setPicker(true)}>
          <Plus size={13} /> {t("rg3.streaks.new")}
        </button>
      </div>
      {shared.length ? (
        shared.map((s) => (
          <div key={s.peer.id} className={`rg-duo${s.atRisk && !s.meToday ? " risk" : ""}`}>
            <span className="rg-pair">
              <Face p={me || { name: "?" }} size={30} />
              <Face p={s.peer} size={30} />
            </span>
            <span className="tx">
              <b>{s.peer.name}</b>
              <small className={s.peerToday && !s.meToday ? "warn" : ""}>{sharedSub(s, t)}</small>
            </span>
            {!s.peerToday && s.meToday && s.canNudge ? (
              <button type="button" className="rg-mini" disabled={busy === `n${s.peer.id}`} onClick={() => act(`n${s.peer.id}`, () => streaksApi.nudge(s.peer.id), t("rg3.streaks.nudged", { name: s.peer.name }))}>
                <BellRing size={13} /> {t("rg3.streaks.nudge")}
              </button>
            ) : null}
            {!s.meToday && onOpenDm ? (
              <button type="button" className="rg-mini" onClick={() => onOpenDm(s.peer)}>
                <MessageCircle size={13} /> {t("rg3.streaks.write")}
              </button>
            ) : null}
            <span className="rg-num">
              <Flame size={15} /> {s.count}
            </span>
          </div>
        ))
      ) : (
        <div className="rg-empty-card">
          <Flame size={18} />
          <p>{t("rg3.streaks.sharedEmpty")}</p>
          <button type="button" className="rg-btn" onClick={() => setPicker(true)}>
            <Plus size={14} /> {t("rg3.streaks.startOne")}
          </button>
        </div>
      )}
    </div>
  );

  const tasksCard = (
    <div className="rg-card">
      <div className="rg-card-h">
        <b>{t("rg3.streaks.tasks")}</b>
        <span className="rg-count">
          {doneCount(tasks)} / {tasks.length || 3}
        </span>
      </div>
      {tasks.length ? (
        tasks.map((task) => (
          <div key={task.slot} className={`rg-task${task.done ? " done" : ""}`}>
            <span className={`rg-check${task.done ? " on" : ""}`} aria-hidden="true">
              {task.done ? <Check size={13} /> : null}
            </span>
            <span className="tx">
              <b>{taskTitle(task, t, locale)}</b>
              <small>{taskSub(task, t, locale)}</small>
              {task.kind === "voice" && !task.done ? (
                <span className="rg-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, Math.round(((task.progress || 0) / (task.goal || 10)) * 100))}%` }} />
                </span>
              ) : null}
            </span>
            {task.kind === "voice" ? <Headphones size={14} className="rg-task-ic" /> : null}
            <Coin amount={task.reward} />
          </div>
        ))
      ) : (
        <p className="rg-empty">{load === "not_ready" ? t("rg3.errors.notReady") : t("rg3.streaks.tasksEmpty")}</p>
      )}
      <p className="rg-foot">{t("rg3.streaks.tasksFoot", { bonus: state?.sharedBonus || 10 })}</p>
    </div>
  );

  return (
    <div className={`rg-streaks${wide ? " wide" : ""}`} ref={hostRef}>
      <div className="rg-streaks-head">
        <p className="rg-lead">{t("rg3.streaks.lead")}</p>
        {personal ? (
          <span className="rg-balance">
            <i aria-hidden="true">D</i> {fmtNum(personal.balance)}
          </span>
        ) : null}
      </div>
      {msg ? (
        <p className={msg.kind === "ok" ? "rg-ok" : "rg-err"} role={msg.kind === "ok" ? "status" : "alert"}>
          {msg.kind === "ok" ? <Check size={13} /> : <AlertTriangle size={13} />} {msg.text}
        </p>
      ) : null}
      <div className="rg-streaks-grid">
        <div className="col">
          {personalCard}
          {sharedCard}
        </div>
        <div className="col">{tasksCard}</div>
      </div>
      {picker ? (
        <FriendPicker
          exclude={exclude}
          t={t}
          onClose={() => setPicker(false)}
          onPick={(p) => {
            setPicker(false);
            act("start", () => streaksApi.start(p.id), t("rg3.streaks.started", { name: p.name }));
          }}
        />
      ) : null}
    </div>
  );
}
