import { useEffect, useMemo, useRef, useState } from "react";
import { motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { BarChart3, Clock, EyeOff, GripVertical, ListChecks, Plus, Search, Send, Smile, X } from "../ui/Icon.jsx";
import { framerSpring, REDUCED_MOTION_FADE, SPRINGS } from "../../lib/fluid/springs";
import { hapticImpactLight } from "../../lib/fluid/haptics";
import { foldTr } from "../../lib/slashCommands";
import PollCard from "./PollCard";
import { Portal, useDismiss } from "./dsxShared";
import "./dsx.css";

export const POLL_LIMITS = { question: 300, option: 100, minOptions: 2, maxOptions: 10 };
export const POLL_DURATIONS = [
  { seconds: 3600, label: "1 sa" },
  { seconds: 14400, label: "4 sa" },
  { seconds: 28800, label: "8 sa" },
  { seconds: 86400, label: "24 sa" },
  { seconds: 259200, label: "3 gün" },
  { seconds: 604800, label: "1 hafta" },
];

const EMOJIS = [
  ["🎮", "oyun"], ["🕹️", "oyun"], ["🪂", "fortnite paraşüt"], ["🧱", "minecraft blok"], ["🚀", "roket"], ["🃏", "kart"],
  ["⚽", "futbol top"], ["🏀", "basketbol"], ["🎲", "zar"], ["♟️", "satranç"], ["🎤", "mikrofon şarkı"], ["🎧", "müzik"],
  ["🍕", "pizza yemek"], ["🍔", "burger yemek"], ["☕", "kahve"], ["🍿", "film"], ["🎬", "film sinema"], ["📺", "dizi"],
  ["🔥", "ateş"], ["💯", "yüz"], ["🎉", "kutlama parti"], ["😂", "gül"], ["😎", "havalı"], ["🤔", "düşün"],
  ["👀", "göz"], ["❤️", "kalp"], ["👍", "evet tamam"], ["👎", "hayır"], ["✅", "evet onay"], ["❌", "hayır iptal"],
  ["⭐", "yıldız"], ["🌙", "gece ay"], ["☀️", "gündüz güneş"], ["📅", "takvim gün"], ["⏰", "saat"], ["🏆", "kupa"],
  ["🎁", "hediye"], ["💡", "fikir"], ["📚", "kitap ders"], ["💻", "bilgisayar"], ["📱", "telefon"], ["🐶", "köpek"],
  ["🐱", "kedi"], ["🌍", "dünya"], ["🏖️", "tatil plaj"], ["🎂", "doğum günü pasta"], ["🥳", "parti"], ["🤝", "anlaşma"],
];

let seq = 0;
const newOption = (text = "", emoji = null) => ({ key: `o${Date.now().toString(36)}${(seq += 1)}`, text, emoji });

function OptionRow({ item, index, count, onChange, onRemove, onEmoji, inputRef, onEnter }) {
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
      <button type="button" className="eb" aria-label={item.emoji ? `Emoji: ${item.emoji}, değiştir` : "Emoji ekle"} onClick={(e) => onEmoji(item, e.currentTarget)}>
        {item.emoji || <Smile className="dsx-ico" />}
      </button>
      <input
        ref={inputRef}
        value={item.text}
        maxLength={POLL_LIMITS.option}
        placeholder={`Seçenek ${index + 1}`}
        aria-label={`Seçenek ${index + 1}`}
        onChange={(e) => onChange(item, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onEnter(index);
          }
        }}
      />
      <button type="button" className="rm" aria-label={`Seçenek ${index + 1}'i kaldır`} disabled={count <= POLL_LIMITS.minOptions} onClick={() => onRemove(item)}>
        <X className="dsx-ico" />
      </button>
    </Reorder.Item>
  );
}

function EmojiPopover({ top, onPick, onClose }) {
  const ref = useRef(null);
  const [q, setQ] = useState("");
  useDismiss(ref, onClose, true);
  const list = useMemo(() => {
    const f = foldTr(q).trim();
    return f ? EMOJIS.filter(([, k]) => foldTr(k).includes(f)) : EMOJIS;
  }, [q]);
  return (
    <div ref={ref} className="dsx-heavy dsx-emopop" style={{ top }} role="dialog" aria-label="Emoji seç">
      <label className="sr">
        <Search className="dsx-ico" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Emoji ara" aria-label="Emoji ara" />
      </label>
      <div className="gr">
        <button type="button" aria-label="Emojiyi kaldır" onClick={() => onPick(null)} style={{ fontSize: 13, color: "var(--dsx-t3)" }}>
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
function previewSnapshot({ question, options, multi, anonymous, durationSeconds }) {
  return {
    id: "preview",
    question: question.trim() || "Sorunu yaz",
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

function endsLabel(seconds) {
  const d = new Date(Date.now() + seconds * 1000);
  const day = d.toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  return `${day} ${time}'te sona erer`;
}

export function validatePollDraft({ question, options }) {
  const q = question.trim();
  if (!q) return "Bir soru yaz.";
  const filled = options.map((o) => o.text.trim()).filter(Boolean);
  if (filled.length < POLL_LIMITS.minOptions) return "En az 2 seçenek gerekli.";
  const seen = new Set();
  for (const t of filled) {
    const k = t.toLocaleLowerCase("tr");
    if (seen.has(k)) return `“${t}” iki kez yazılmış.`;
    seen.add(k);
  }
  return "";
}

/**
 * Anket oluştur (poll/01, iOS poll/09–10). Web/Electron: 1040×740 heavy sheet
 * with a live preview. Phones: bottom sheet with "Vazgeç · Anket oluştur · Gönder".
 * `initial` switches it to edit mode (creator, before the first vote).
 */
export default function PollCreateSheet({ onClose, onSubmit, targetLabel = "", compact = false, initial = null }) {
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
  const invalid = validatePollDraft(draft);

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
      setError(res.message || "Anket gönderilemedi.");
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
  const sendLabel = editing ? "Değişiklikleri kaydet" : "Anketi gönder";

  const form = (
    <>
      <div className="dsx-lbl">
        Soru <i>{question.length} / {POLL_LIMITS.question}</i>
      </div>
      <input
        ref={qRef}
        className="dsx-fld"
        value={question}
        maxLength={POLL_LIMITS.question}
        placeholder="Ne sormak istiyorsun?"
        aria-label="Soru"
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            optRefs.current[options[0]?.key]?.focus();
          }
        }}
      />
      <div className="dsx-lbl">
        Seçenekler <i>{options.length} / {POLL_LIMITS.maxOptions} · sürükleyerek sırala</i>
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
        <Plus className="dsx-ico" /> Seçenek ekle
      </button>
      <div className="dsx-set">
        <div className="sr">
          <span className="sic" style={{ background: "linear-gradient(160deg,#6d8cff,#4a5fe0)" }}><ListChecks className="dsx-ico" /></span>
          <div className="st">
            <b>Birden fazla seçim</b>
            <span>Üyeler birden çok seçeneğe oy verebilir</span>
          </div>
          <button type="button" role="switch" aria-checked={multi} aria-label="Birden fazla seçim" className="dsx-toggle" onClick={() => setMulti((v) => !v)} />
        </div>
        <div className="sr">
          <span className="sic" style={{ background: "linear-gradient(160deg,#8a93a8,#5d6478)" }}><EyeOff className="dsx-ico" /></span>
          <div className="st">
            <b>Anonim oylama</b>
            <span>Oylar kaydedilir ama kimin neye oy verdiği kimseye gösterilmez, yalnızca sayılar görünür</span>
          </div>
          <button type="button" role="switch" aria-checked={anonymous} aria-label="Anonim oylama" className="dsx-toggle" onClick={() => setAnonymous((v) => !v)} />
        </div>
        {editing ? null : (
          <div className="sr wrap">
            <span className="sic" style={{ background: "linear-gradient(160deg,#ffb35c,#e0782f)" }}><Clock className="dsx-ico" /></span>
            <div className="st">
              <b>Süre</b>
              <span>{endsLabel(durationSeconds)}</span>
            </div>
            <div className="dsx-seg" role="group" aria-label="Süre">
              {POLL_DURATIONS.map((d) => (
                <button key={d.seconds} type="button" aria-pressed={durationSeconds === d.seconds} onClick={() => setDuration(d.seconds)}>
                  {d.label}
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
          aria-label={editing ? "Anketi düzenle" : "Anket oluştur"}
          style={{ zIndex: 9001 }}
          initial={reduce ? { opacity: 0 } : { y: "100%" }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={transition}
        >
          <div className="form" ref={formRef}>
            <div className="grab" aria-hidden="true" />
            <div className="ibar">
              <button type="button" onClick={onClose}>Vazgeç</button>
              <b>{editing ? "Anketi düzenle" : "Anket oluştur"}</b>
              <button type="button" className="go" onClick={submit} disabled={busy || Boolean(invalid)}>
                {editing ? "Kaydet" : "Gönder"}
              </button>
            </div>
            {form}
            <div className="ifoot">
              {error ? <span style={{ color: "#ff9a8a" }}>{error}</span> : targetLabel ? `${targetLabel} gönderilecek` : null}
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
          aria-label={editing ? "Anketi düzenle" : "Anket oluştur"}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.98 }}
          transition={transition}
        >
          <div className="form" ref={formRef}>
            <div className="dsx-shd">
              <span className="ti"><BarChart3 className="dsx-ico" /></span>
              <div>
                <b>{editing ? "Anketi düzenle" : "Anket oluştur"}</b>
                <span>{editing ? "Henüz oy yok, değişiklikler herkese yansır" : targetLabel ? `${targetLabel} gönderilecek` : ""}</span>
              </div>
              <button type="button" className="x" aria-label="Kapat" onClick={onClose}>
                <X className="dsx-ico" />
              </button>
            </div>
            {form}
            <div className="dsx-cfoot">
              <span className="dsx-kbd">⌘</span>
              <span className="dsx-kbd">↵</span> gönder
              {error ? <span className="err" role="alert">{error}</span> : null}
              <span className="r">
                <button type="button" className="dsx-btn ghost" onClick={onClose}>Vazgeç</button>
                <button type="button" className="dsx-btn pri" onClick={submit} disabled={busy}>
                  <Send className="dsx-ico" /> {sendLabel}
                </button>
              </span>
            </div>
          </div>
          <div className="dsx-preview">
            <div className="dsx-sect">Önizleme</div>
            <PollCard preview={previewSnapshot(draft)} compact />
            <div className="note">
              {filledCount < 2
                ? "En az iki seçenek yaz, önizleme burada güncellenir."
                : "Üyeler bir seçeneğe dokunarak oy verir. Oyunu anket bitene kadar değiştirebilir. Sonuç çubukları oy verdikten sonra açılır."}
            </div>
          </div>
        </motion.div>
      </div>
    </Portal>
  );
}
