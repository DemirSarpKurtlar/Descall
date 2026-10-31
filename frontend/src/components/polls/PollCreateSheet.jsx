import { useEffect, useMemo, useRef, useState } from "react";
import { motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { BarChart3, Clock, EyeOff, GripVertical, ListChecks, Plus, Search, Send, Smile, X } from "../ui/Icon.jsx";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { foldTr } from "../../lib/slashCommands";
import PollCard from "./PollCard";
import { appClock, Portal, useDismiss } from "./dsxShared";
import { useLocale } from "../../context/LocaleContext";
import { durationLabel } from "../../lib/slashCommands";
import { formatDate } from "../../i18n/format";
import { t as rt } from "../../i18n/runtime";
import { APP_TIMEZONE } from "../../lib/datetime";
import "./dsx.css";

export const POLL_LIMITS = { question: 300, option: 100, minOptions: 2, maxOptions: 10 };
/** Chip labels come from Intl unit names in the UI language (durationLabel). */
export const POLL_DURATIONS = [
  { seconds: 3600, value: 1, unit: "hour", display: "short" },
  { seconds: 14400, value: 4, unit: "hour", display: "short" },
  { seconds: 28800, value: 8, unit: "hour", display: "short" },
  { seconds: 86400, value: 24, unit: "hour", display: "short" },
  { seconds: 259200, value: 3, unit: "day", display: "long" },
  { seconds: 604800, value: 1, unit: "week", display: "long" },
];

/**
 * Emoji search data: [emoji, search words]. The words are never shown (each button's
 * label is the emoji itself); Turkish and English words are both listed so the search
 * works in either language.
 */

const EMOJIS = [
  ["🎮", "oyun game"], ["🕹️", "oyun game joystick"], ["🪂", "fortnite paraşüt parachute"], ["🧱", "minecraft blok block"], ["🚀", "roket rocket"], ["🃏", "kart card"],
  ["⚽", "futbol top football soccer ball"], ["🏀", "basketbol basketball"], ["🎲", "zar dice"], ["♟️", "satranç chess"], ["🎤", "mikrofon şarkı microphone sing"], ["🎧", "müzik music"],
  ["🍕", "pizza yemek food"], ["🍔", "burger yemek food"], ["☕", "kahve coffee"], ["🍿", "film movie popcorn"], ["🎬", "film sinema movie cinema"], ["📺", "dizi tv series"],
  ["🔥", "ateş fire"], ["💯", "yüz hundred"], ["🎉", "kutlama parti party celebrate"], ["😂", "gül laugh"], ["😎", "havalı cool"], ["🤔", "düşün think"],
  ["👀", "göz eyes look"], ["❤️", "kalp heart love"], ["👍", "evet tamam yes ok"], ["👎", "hayır no"], ["✅", "evet onay yes check"], ["❌", "hayır iptal no cancel"],
  ["⭐", "yıldız star"], ["🌙", "gece ay night moon"], ["☀️", "gündüz güneş day sun"], ["📅", "takvim gün calendar date"], ["⏰", "saat clock alarm time"], ["🏆", "kupa trophy cup"],
  ["🎁", "hediye gift"], ["💡", "fikir idea"], ["📚", "kitap ders book study"], ["💻", "bilgisayar computer laptop"], ["📱", "telefon phone"], ["🐶", "köpek dog"],
  ["🐱", "kedi cat"], ["🌍", "dünya world earth"], ["🏖️", "tatil plaj holiday beach"], ["🎂", "doğum günü pasta birthday cake"], ["🥳", "parti party"], ["🤝", "anlaşma deal handshake"],
];

let seq = 0;
const newOption = (text = "", emoji = null) => ({ key: `o${Date.now().toString(36)}${(seq += 1)}`, text, emoji });

function OptionRow({ item, index, count, onChange, onRemove, onEmoji, inputRef, onEnter }) {
  const { t } = useLocale();
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      className="dsx-op"
      whileDrag={{ scale: 1.025, rotate: -0.6, zIndex: 5, boxShadow: "inset 0 0 0 1px rgba(88,122,246,.6), 0 18px 40px rgba(0,0,0,.5)" }}
      as="li"
    >
      <span className="grip" aria-hidden="true" onPointerDown={(e) => controls.start(e)}>
        <GripVertical className="dsx-ico" />
      </span>
      <button type="button" className="eb" aria-label={item.emoji ? t("polls.create.emojiChange", { emoji: item.emoji }) : t("polls.create.emojiAdd")} onClick={(e) => onEmoji(item, e.currentTarget)}>
        {item.emoji || <Smile className="dsx-ico" />}
      </button>
      <input
        ref={inputRef}
        value={item.text}
        maxLength={POLL_LIMITS.option}
        placeholder={t("polls.create.option", { n: index + 1 })}
        aria-label={t("polls.create.option", { n: index + 1 })}
        onChange={(e) => onChange(item, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onEnter(index);
          }
        }}
      />
      <button type="button" className="rm" aria-label={t("polls.create.optionRemove", { n: index + 1 })} disabled={count <= POLL_LIMITS.minOptions} onClick={() => onRemove(item)}>
        <X className="dsx-ico" />
      </button>
    </Reorder.Item>
  );
}

function EmojiPopover({ top, onPick, onClose }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const [q, setQ] = useState("");
  useDismiss(ref, onClose, true);
  const list = useMemo(() => {
    const f = foldTr(q).trim();
    return f ? EMOJIS.filter(([, k]) => foldTr(k).includes(f)) : EMOJIS;
  }, [q]);
  return (
    <div ref={ref} className="dsx-heavy dsx-emopop" style={{ top }} role="dialog" aria-label={t("polls.create.emojiPick")}>
      <label className="sr">
        <Search className="dsx-ico" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("polls.create.emojiSearch")} aria-label={t("polls.create.emojiSearch")} />
      </label>
      <div className="gr">
        <button type="button" aria-label={t("polls.create.emojiRemove")} onClick={() => onPick(null)} style={{ fontSize: 13, color: "var(--dsx-t3)" }}>
          <X className="dsx-ico" />
        </button>
        {list.map(([e]) => (
          <button key={e} type="button" onClick={() => onPick(e)} aria-label={e}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Local preview snapshot (same card as in chat, open state). */
function previewSnapshot({ question, options, multi, anonymous, durationSeconds }, t) {
  return {
    id: "preview",
    question: question.trim() || t("polls.create.previewQuestion"),
    options: options
      .filter((o) => o.text.trim())
      .map((o, i) => ({ id: o.key, text: o.text.trim(), emoji: o.emoji, votes: null, percent: null, position: i })),
    multi,
    anonymous,
    endsAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
    closed: false,
    revealed: false,
    voters: 0,
    myVotes: [],
    canVote: false,
  };
}

function endsLabel(seconds, t, locale) {
  const d = new Date(Date.now() + seconds * 1000);
  const date = formatDate(d, locale, { day: "numeric", month: "short", timeZone: APP_TIMEZONE });
  return t("polls.create.endsAt", { date, time: appClock(d.toISOString(), locale) });
}

export function validatePollDraft({ question, options }, t = rt) {
  const q = question.trim();
  if (!q) return t("polls.create.errQuestion");
  const filled = options.map((o) => o.text.trim()).filter(Boolean);
  if (filled.length < POLL_LIMITS.minOptions) return t("polls.create.errMinOptions");
  const seen = new Set();
  for (const opt of filled) {
    const k = opt.toLocaleLowerCase("tr");
    if (seen.has(k)) return t("polls.create.errDuplicate", { option: opt });
    seen.add(k);
  }
  return "";
}

/**
 * Create poll (poll/01, iOS poll/09–10). Web/Electron: 1040×740 heavy sheet
 * with a live preview. Phones: bottom sheet with "Cancel · Create poll · Send".
 * `initial` switches it to edit mode (creator, before the first vote).
 */
export default function PollCreateSheet({ onClose, onSubmit, targetLabel = "", compact = false, initial = null }) {
  const { t, locale } = useLocale();
  const reduce = useReducedMotion();
  const [question, setQuestion] = useState(initial?.question || "");
  const [options, setOptions] = useState(() =>
    initial?.options?.length
      ? initial.options.map((o) => newOption(o.text, o.emoji || null))
      : [newOption(), newOption()]
  );
  const [multi, setMulti] = useState(Boolean(initial?.multi));
  const [anonymous, setAnonymous] = useState(Boolean(initial?.anonymous));
  const [durationSeconds, setDuration] = useState(86400);
  const [emojiFor, setEmojiFor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const qRef = useRef(null);
  const optRefs = useRef({});
  const formRef = useRef(null);
  const editing = Boolean(initial);

  useEffect(() => {
    const id = window.setTimeout(() => qRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, []);

  const draft = { question, options, multi, anonymous, durationSeconds };
  const invalid = validatePollDraft(draft, t);

  const submit = async () => {
    if (busy) return;
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError("");
    const poll = {
      question: question.trim(),
      options: options.filter((o) => o.text.trim()).map((o) => ({ text: o.text.trim(), emoji: o.emoji || null })),
      multi,
      anonymous,
      durationSeconds,
    };
    const res = await onSubmit?.(poll);
    setBusy(false);
    if (res && res.ok === false) {
      setError(res.message || t("polls.create.sendFailed"));
      return;
    }
    onClose?.();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !emojiFor) {
        e.preventDefault();
        onClose?.();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const change = (item, text) => setOptions((list) => list.map((o) => (o.key === item.key ? { ...o, text } : o)));
  const remove = (item) => setOptions((list) => (list.length > POLL_LIMITS.minOptions ? list.filter((o) => o.key !== item.key) : list));
  const add = () => {
    if (options.length >= POLL_LIMITS.maxOptions) return;
    const o = newOption();
    setOptions((list) => [...list, o]);
    hapticImpactLight();
    requestAnimationFrame(() => optRefs.current[o.key]?.focus());
  };
  const onEnter = (index) => {
    const next = options[index + 1];
    if (next) optRefs.current[next.key]?.focus();
    else add();
  };
  const openEmoji = (item, el) => {
    const host = formRef.current?.querySelector(".dsx-ops-wrap");
    const top = host ? el.getBoundingClientRect().bottom - host.getBoundingClientRect().top + 6 : 48;
    setEmojiFor({ key: item.key, top });
  };

  const filledCount = options.filter((o) => o.text.trim()).length;
  const transition = reduce ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.sheet);
  const sendLabel = editing ? t("polls.create.saveChanges") : t("polls.create.sendPoll");
  const sheetTitle = editing ? t("polls.create.titleEdit") : t("polls.create.titleCreate");

  const form = (
    <>
      <div className="dsx-lbl">
        {t("polls.create.question")} <i>{question.length} / {POLL_LIMITS.question}</i>
      </div>
      <input
        ref={qRef}
        className="dsx-fld"
        value={question}
        maxLength={POLL_LIMITS.question}
        placeholder={t("polls.create.questionPlaceholder")}
        aria-label={t("polls.create.question")}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            optRefs.current[options[0]?.key]?.focus();
          }
        }}
      />
      <div className="dsx-lbl">
        {t("polls.create.options")} <i>{t("polls.create.optionsNote", { count: options.length, max: POLL_LIMITS.maxOptions })}</i>
      </div>
      <div className="dsx-ops-wrap" style={{ position: "relative" }}>
      <Reorder.Group axis="y" values={options} onReorder={setOptions} className="dsx-ops" as="ol">
        {options.map((item, i) => (
          <OptionRow
            key={item.key}
            item={item}
            index={i}
            count={options.length}
            onChange={change}
            onRemove={remove}
            onEmoji={openEmoji}
            onEnter={onEnter}
            inputRef={(el) => {
              optRefs.current[item.key] = el;
            }}
          />
        ))}
      </Reorder.Group>
        {emojiFor ? (
          <EmojiPopover
            top={emojiFor.top}
            onClose={() => setEmojiFor(null)}
            onPick={(emoji) => {
              setOptions((list) => list.map((o) => (o.key === emojiFor.key ? { ...o, emoji } : o)));
              setEmojiFor(null);
              requestAnimationFrame(() => optRefs.current[emojiFor.key]?.focus());
            }}
          />
        ) : null}
      </div>
      <button type="button" className="dsx-addop" onClick={add} disabled={options.length >= POLL_LIMITS.maxOptions}>
        <Plus className="dsx-ico" /> {t("polls.create.addOption")}
      </button>
      <div className="dsx-set">
        <div className="sr">
          <span className="sic" style={{ background: "linear-gradient(160deg,#6d8cff,#4a5fe0)" }}><ListChecks className="dsx-ico" /></span>
          <div className="st">
            <b>{t("polls.create.multi")}</b>
            <span>{t("polls.create.multiHint")}</span>
          </div>
          <button type="button" role="switch" aria-checked={multi} aria-label={t("polls.create.multi")} className="dsx-toggle" onClick={() => setMulti((v) => !v)} />
        </div>
        <div className="sr">
          <span className="sic" style={{ background: "linear-gradient(160deg,#8a93a8,#5d6478)" }}><EyeOff className="dsx-ico" /></span>
          <div className="st">
            <b>{t("polls.create.anon")}</b>
            <span>{t("polls.create.anonHint")}</span>
          </div>
          <button type="button" role="switch" aria-checked={anonymous} aria-label={t("polls.create.anon")} className="dsx-toggle" onClick={() => setAnonymous((v) => !v)} />
        </div>
        {editing ? null : (
          <div className="sr wrap">
            <span className="sic" style={{ background: "linear-gradient(160deg,#ffb35c,#e0782f)" }}><Clock className="dsx-ico" /></span>
            <div className="st">
              <b>{t("polls.create.duration")}</b>
              <span>{endsLabel(durationSeconds, t, locale)}</span>
            </div>
            <div className="dsx-seg" role="group" aria-label={t("polls.create.duration")}>
              {POLL_DURATIONS.map((d) => (
                <button key={d.seconds} type="button" aria-pressed={durationSeconds === d.seconds} onClick={() => setDuration(d.seconds)}>
                  {durationLabel(d.value, d.unit, d.display)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (compact) {
    return (
      <Portal>
        <motion.div className="dsx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
        <motion.div
          className="dsx-heavy dsx-create is-compact"
          role="dialog"
          aria-modal="true"
          aria-label={sheetTitle}
          style={{ zIndex: 9001 }}
          initial={reduce ? { opacity: 0 } : { y: "100%" }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={transition}
        >
          <div className="form" ref={formRef}>
            <div className="grab" aria-hidden="true" />
            <div className="ibar">
              <button type="button" onClick={onClose}>{t("polls.cancel")}</button>
              <b>{sheetTitle}</b>
              <button type="button" className="go" onClick={submit} disabled={busy || Boolean(invalid)}>
                {editing ? t("polls.create.save") : t("polls.create.send")}
              </button>
            </div>
            {form}
            <div className="ifoot">
              {error ? <span style={{ color: "#ff9a8a" }}>{error}</span> : targetLabel || null}
            </div>
          </div>
        </motion.div>
      </Portal>
    );
  }

  return (
    <Portal>
      <motion.div className="dsx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <div className="dsx-sheetwrap">
        <motion.div
          className="dsx-heavy dsx-create"
          role="dialog"
          aria-modal="true"
          aria-label={sheetTitle}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
          transition={transition}
        >
          <div className="form" ref={formRef}>
            <div className="dsx-shd">
              <span className="ti"><BarChart3 className="dsx-ico" /></span>
              <div>
                <b>{sheetTitle}</b>
                <span>{editing ? t("polls.create.editHint") : targetLabel}</span>
              </div>
              <button type="button" className="x" aria-label={t("polls.close")} onClick={onClose}>
                <X className="dsx-ico" />
              </button>
            </div>
            {form}
            <div className="dsx-cfoot">
              <span className="dsx-kbd">⌘</span>
              <span className="dsx-kbd">↵</span> {t("polls.create.kbdSend")}
              {error ? <span className="err" role="alert">{error}</span> : null}
              <span className="r">
                <button type="button" className="dsx-btn ghost" onClick={onClose}>{t("polls.cancel")}</button>
                <button type="button" className="dsx-btn pri" onClick={submit} disabled={busy}>
                  <Send className="dsx-ico" /> {sendLabel}
                </button>
              </span>
            </div>
          </div>
          <div className="dsx-preview">
            <div className="dsx-sect">{t("polls.create.preview")}</div>
            <PollCard preview={previewSnapshot(draft, t)} compact />
            <div className="note">
              {filledCount < 2
                ? t("polls.create.previewEmpty")
                : t("polls.create.previewNote")}
            </div>
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
