import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BarChart3, Check, Clock, EyeOff, MoreHorizontal, Pencil, Sparkles, Square, Trophy, Undo2, Users,
} from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import { confirmAction } from "../../lib/glassConfirm";
import { hapticImpactLight, hapticSuccess, hapticError } from "../../lib/fluid/haptics";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import {
  closePollNow, ensurePoll, getPollSnapshot, pollEndedAt, pollTimeLeft, subscribePoll, votePoll,
} from "../../lib/pollStore";
import { percent, useCountUp, useDismiss } from "./dsxShared";
import { useLocale } from "../../context/LocaleContext";
import { t as rt } from "../../i18n/runtime";
import "./dsx.css";

/** Parses the server's plain fallback text ("📊 Anket: Q\n1. 🪂 A") until the snapshot arrives. */
export function snapshotFromFallback(message) {
  const text = String(message?.text || message?.content || "");
  const lines = text.split("\n");
  const q = (lines[0] || "").replace(/^📊\s*Anket:\s*/u, "").trim();
  const options = lines
    .slice(1)
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => l.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean)
    .map((t, i) => ({ id: `fb-${i}`, text: t, emoji: null, votes: null, percent: null }));
  return {
    id: null,
    messageId: message?.id,
    question: q || rt("polls.poll.fallbackQuestion"),
    options,
    multi: false,
    anonymous: false,
    closed: false,
    revealed: false,
    voters: 0,
    myVotes: [],
    canVote: false,
    placeholder: true,
  };
}

function usePollSnapshot(scope, message) {
  const messageId = message?.id;
  const [snap, setSnap] = useState(() => getPollSnapshot(messageId) || message?.poll || null);
  useEffect(() => {
    if (!messageId) return undefined;
    const cur = getPollSnapshot(messageId);
    if (cur) setSnap(cur);
    const off = subscribePoll(messageId, (s) => s && setSnap(s));
    ensurePoll(scope, messageId);
    return off;
  }, [scope, messageId]);
  return snap;
}

function useNowMinute(enabled) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function Pct({ value, animate }) {
  const { locale } = useLocale();
  const n = useCountUp(value, { enabled: animate });
  return <>{percent(n, locale)}</>;
}

function Row({ poll, option, index, pending, onPick, compact, enter }) {
  const { t } = useLocale();
  const revealed = poll.revealed;
  const closed = poll.closed;
  const mine = (poll.myVotes || []).includes(option.id);
  const picked = pending ? pending.includes(option.id) : mine;
  const interactive = Boolean(poll.canVote) && !closed && !poll.placeholder && typeof onPick === "function";
  const role = poll.multi ? "checkbox" : "radio";
  const emoji = option.emoji ? <span className="emo">{option.emoji}</span> : null;

  if (!revealed) {
    const label = picked ? t("polls.poll.ariaPicked", { option: option.text }) : option.text;
    const Tag = interactive ? "button" : "div";
    return (
      <Tag
        type={interactive ? "button" : undefined}
        className={`dsx-po ${picked ? "is-picked" : ""}`}
        role={role}
        aria-checked={picked}
        aria-label={label}
        disabled={interactive ? Boolean(pending) : undefined}
        onClick={interactive ? () => onPick(option) : undefined}
      >
        <span className={`rad ${poll.multi ? "sq" : ""}`} />
        {emoji}
        <span className="ot">{option.text}</span>
      </Tag>
    );
  }

  const maxVotes = Math.max(0, ...poll.options.map((o) => o.votes || 0));
  const lead = !closed && (option.votes || 0) > 0 && option.votes === maxVotes;
  const win = closed && option.winner;
  const pct = option.percent ?? 0;
  const label = `${t("polls.poll.ariaResult", { option: option.text, votes: option.votes || 0, pct })}${mine ? t("polls.poll.ariaMine") : ""}${win ? t("polls.poll.ariaWinner") : ""}`;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      type={interactive ? "button" : undefined}
      className={`dsx-po ${mine ? "mine" : ""} ${lead ? "lead" : ""} ${win ? "win" : ""} ${closed && !win ? "dim" : ""}`}
      role={role}
      aria-checked={mine}
      aria-label={label}
      disabled={interactive ? Boolean(pending) : undefined}
      onClick={interactive ? () => onPick(option) : undefined}
      style={{ "--w": `${pct}%`, "--d": `${index * 0.04}s` }}
    >
      <span className={`bar ${enter ? "is-enter" : ""}`} />
      {win ? (
        <span className="trophy"><Trophy className="dsx-ico" /></span>
      ) : mine ? (
        <span className="chk"><Check className="dsx-ico" /></span>
      ) : (
        <span className="nochk" />
      )}
      {emoji}
      <span className="ot">{option.text}</span>
      {win && !compact ? <span className="dsx-wintag">{t("polls.poll.winnerTag")}</span> : null}
      {!poll.anonymous && !compact && option.recent?.length ? (
        <span className="dsx-stk" aria-hidden="true">
          {option.recent.slice(0, 3).map((u) => (
            <Avatar key={u.id} size={20} name={u.displayName || u.username || ""} user={u} imageUrl={u.avatarUrl || undefined} animate="never" />
          ))}
        </span>
      ) : null}
      <span className="vc">{t("polls.poll.votes", { count: option.votes || 0 })}</span>
      <span className="pc"><Pct value={pct} animate={enter} /></span>
    </Tag>
  );
}

/**
 * Votable poll card (poll/00–13). Results stay hidden until you vote or the
 * poll ends; the server enforces that, the card only renders what it gets.
 */
export default function PollCard({ message, scope, onOpenVoters, onEdit, compact = false, preview = null }) {
  const { t, locale } = useLocale();
  const live = usePollSnapshot(preview ? null : scope, preview ? null : message);
  const poll = preview || live || snapshotFromFallback(message);
  const reduce = useReducedMotion();
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const now = useNowMinute(!poll.closed);
  useDismiss(menuRef, () => setMenuOpen(false), menuOpen);

  // Bars grow from 0 the first time results show (vote or end), not on every refresh.
  const wasRevealed = useRef(poll.revealed);
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    if (poll.revealed && !wasRevealed.current) {
      setEnter(true);
      const id = window.setTimeout(() => setEnter(false), 1000);
      wasRevealed.current = true;
      return () => window.clearTimeout(id);
    }
    wasRevealed.current = poll.revealed;
    return undefined;
  }, [poll.revealed]);

  const wasClosed = useRef(poll.closed);
  useEffect(() => {
    if (poll.closed && !wasClosed.current && !poll.placeholder) hapticSuccess();
    wasClosed.current = poll.closed;
  }, [poll.closed, poll.placeholder]);

  const send = useCallback(
    async (optionIds) => {
      if (!poll.id) return;
      setPending(optionIds);
      setError("");
      hapticImpactLight();
      const res = await votePoll(poll, optionIds);
      setPending(null);
      if (!res?.ok) {
        hapticError();
        setError(res?.message || t("polls.poll.voteFailed"));
      }
    },
    [poll, t]
  );

  const onPick = useCallback(
    (option) => {
      const mine = poll.myVotes || [];
      if (poll.multi) {
        const next = mine.includes(option.id) ? mine.filter((x) => x !== option.id) : [...mine, option.id];
        send(next);
      } else if (!mine.includes(option.id)) {
        send([option.id]);
      }
    },
    [poll, send]
  );

  const endEarly = async () => {
    setMenuOpen(false);
    const ok = await confirmAction({
      title: t("polls.poll.endTitle"),
      message: t("polls.poll.endBody"),
      confirmLabel: t("polls.poll.endConfirm"),
      cancelLabel: t("polls.cancel"),
      danger: true,
    });
    if (!ok) return;
    const res = await closePollNow(poll);
    if (!res?.ok) setError(res?.message || t("polls.poll.endFailed"));
  };

  const winners = (poll.options || []).filter((o) => o.winner);
  const voters = Number(poll.voters) || 0;
  const hasMenu = !preview && !poll.placeholder && (poll.canClose || poll.canEdit) && !poll.closed;
  const state = poll.closed ? "ended" : poll.revealed ? "voted" : "open";
  const label = (o) => `${o.emoji ? `${o.emoji} ` : ""}${o.text}`;
  const menuTransition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize);

  return (
    <div
      className={`dsx-card dsx-poll ${compact ? "is-compact" : ""}`}
      role="group"
      aria-label={t("polls.poll.aria", { question: poll.question })}
      data-poll-state={state}
    >
      <div className="ph">
        <span className={`pk ${poll.closed ? "ended" : ""}`}>
          <BarChart3 className="dsx-ico" /> {poll.closed ? t("polls.poll.badgeEnded") : t("polls.poll.badge")}
        </span>
        <span>{poll.multi ? t("polls.poll.multi") : t("polls.poll.single")}</span>
        {poll.anonymous ? (
          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
            · <EyeOff className="dsx-ico" /> {t("polls.poll.anonymous")}
          </span>
        ) : null}
        <span className="sp">
          {poll.closed ? (
            <>
              <Check className="dsx-ico" /> {pollEndedAt(poll, locale)}
            </>
          ) : poll.endsAt ? (
            <>
              <Clock className="dsx-ico" /> {pollTimeLeft(poll.endsAt, now)}
            </>
          ) : null}
        </span>
        {hasMenu ? (
          <button
            type="button"
            className="more"
            aria-label={t("polls.poll.menu")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="dsx-ico" />
          </button>
        ) : null}
      </div>
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            ref={menuRef}
            className="dsx-heavy dsx-pollmenu"
            role="menu"
            style={{ transformOrigin: "100% 0%" }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, y: -4 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={menuTransition}
          >
            {poll.canEdit ? (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit?.(poll); }}>
                <Pencil className="dsx-ico" /> {t("polls.poll.edit")}
              </button>
            ) : null}
            {poll.canClose ? (
              <button type="button" role="menuitem" className="dng" onClick={endEarly}>
                <Square className="dsx-ico" /> {t("polls.poll.endNow")}
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <h3>{poll.question}</h3>
      <div className="dsx-po-list" role={poll.multi ? "group" : "radiogroup"} aria-label={poll.question}>
        {(poll.options || []).map((o, i) => (
          <Row
            key={o.id}
            poll={poll}
            option={o}
            index={i}
            pending={pending}
            onPick={preview ? null : onPick}
            compact={compact}
            enter={enter}
          />
        ))}
      </div>
      {state === "open" ? (
        <div className="pf">
          <span className="hint">
            <Sparkles className="dsx-ico" /> {poll.canVote || preview ? (compact ? t("polls.poll.tapShort") : t("polls.poll.tap")) : t("polls.poll.cantVote")}
          </span>
          <span className="r">
            <span style={{ fontSize: 12, color: "var(--dsx-t3)" }}>
              {voters ? t("polls.poll.votesHidden", { count: voters }) : t("polls.poll.noVotes")}
            </span>
          </span>
        </div>
      ) : null}
      {state === "voted" ? (
        <div className="pf">
          <span>{t("polls.poll.votes", { count: voters })}</span>
          <span className="dot" />
          {poll.anonymous ? (
            <span>{t("polls.poll.anonymous")}</span>
          ) : (
            <button type="button" className="lnk" aria-label={t("polls.voters.title")} onClick={() => onOpenVoters?.(poll)}>
              {t("polls.voters.title")}
            </button>
          )}
          {poll.canVote && (poll.myVotes || []).length ? (
            <span className="r">
              <button type="button" className="dsx-btn ghost" disabled={Boolean(pending)} onClick={() => send([])}>
                <Undo2 className="dsx-ico" /> {t("polls.poll.undo")}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      {state === "ended" ? (
        <div className="pf" style={{ whiteSpace: "nowrap" }}>
          <span>{t("polls.poll.votes", { count: voters })}</span>
          <span className="dot" />
          {!voters ? (
            <span>{t("polls.poll.nobodyVoted")}</span>
          ) : winners.length === 1 ? (
            <span>
              {t("polls.poll.winner")} <b style={{ color: "var(--dsx-t1)" }}>{label(winners[0])}{compact ? "" : ` · ${percent(winners[0].percent ?? 0, locale)}`}</b>
            </span>
          ) : winners.length > 1 ? (
            <span>
              {t("polls.poll.tie")} <b style={{ color: "var(--dsx-t1)" }}>{winners.map(label).join(", ")}</b>
            </span>
          ) : null}
          {!poll.anonymous && voters ? (
            <span className="r">
              <button type="button" className="dsx-btn ghost" onClick={() => onOpenVoters?.(poll)} aria-label={t("polls.poll.voters")}>
                <Users className="dsx-ico" />
                {compact ? null : ` ${t("polls.poll.voters")}`}
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? <div className="note" role="alert">{error}</div> : null}
    </div>
  );
}
