import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "../../context/LocaleContext";
import { Av, I } from "../servers/hub/kit";
import { useReducedMotionPref } from "../servers/hub/useHubMode";
import { framerSpring, SPRINGS, REDUCED_MOTION_FADE } from "../../lib/fluid/springs";
import "./CallTapCard.css";

/**
 * 3.0.0 (C3 / S12 / S13), mockups 31 + 32.
 *  - kind "group-join": bottom glass card "Aramaya katıl" with who is in the
 *    call, elapsed time, mic/camera presets, big join button, "Şimdi değil".
 *  - kind "ended": full-screen "Arama sona erdi" with duration, a call log row
 *    (type · time, why it ended) and Geri ara / Mesaj / Kapat.
 * Portal to body; centred with margins (never translateX(-50%)).
 */
export const CALL_TAP_STR = {
  tr: {
    live: "Grup araması sürüyor", liveVideo: "Görüntülü grup araması sürüyor", micOn: "Mikrofon açık", micOff: "Mikrofon kapalı", camOn: "Kamera açık", camOff: "Kamera kapalı",
    join: "Aramaya katıl", notNow: "Şimdi değil", ended: "Arama sona erdi", voiceCall: "Sesli arama", videoCall: "Görüntülü arama",
    groupVoice: "Grup araması", groupVideo: "Görüntülü grup araması",
    callBack: "Geri ara", message: "Mesaj", close: "Kapat", and: "ve", more: "{n} kişi daha", talking: "{names} konuşuyor", nobody: "Aramada kimse kalmadı",
    rRemote: "Bağlantı kesildi ({name} ayrıldı)", rLocal: "Aramayı sen bitirdin", rMissed: "Sen açmadan arama bitti", rGroup: "Grup araması bitti", rDrop: "Bağlantı kesildi",
    group: "Grup", dialog: "Arama",
  },
  en: {
    live: "Group call in progress", liveVideo: "Group video call in progress", micOn: "Mic on", micOff: "Mic off", camOn: "Camera on", camOff: "Camera off",
    join: "Join the call", notNow: "Not now", ended: "Call ended", voiceCall: "Voice call", videoCall: "Video call",
    groupVoice: "Group call", groupVideo: "Group video call",
    callBack: "Call back", message: "Message", close: "Close", and: "and", more: "{n} more", talking: "{names} are talking", nobody: "Nobody is left in the call",
    rRemote: "Disconnected ({name} left)", rLocal: "You ended the call", rMissed: "The call ended before you answered", rGroup: "The group call ended", rDrop: "Disconnected",
    group: "Group", dialog: "Call",
  },
};
const STR = CALL_TAP_STR;
const fmt = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ""));

export function formatClock(totalSec) {
  const s = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

/** "Mert", "Mert ve Ayşe", "Mert, Ayşe ve Zeynep", "Mert, Ayşe ve 3 kişi daha". */
export function joinNames(names, S) {
  const list = (names || []).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length <= 3) return `${list.slice(0, -1).join(", ")} ${S.and} ${list[list.length - 1]}`;
  return `${list.slice(0, 2).join(", ")} ${S.and} ${fmt(S.more, { n: list.length - 2 })}`;
}

export function endReasonText(card, S) {
  const name = card?.peerName || "";
  if (card?.reason === "remote") return name ? fmt(S.rRemote, { name }) : S.rDrop;
  if (card?.reason === "local") return S.rLocal;
  if (card?.reason === "missed" || (!card?.duration && card?.peerId)) return S.rMissed;
  if (card?.groupId) return S.rGroup;
  return S.rDrop;
}

const hm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function useTick(on) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [on]);
}

function JoinCard({ card, S, onJoin, onClose, reduced }) {
  const video = card.callType === "video";
  const [mic, setMic] = useState(card.micOn !== false);
  const [cam, setCam] = useState(video);
  useTick(Boolean(card.startTime));
  const people = (card.participants || []).filter(Boolean);
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  const elapsed = card.startTime ? ` · ${formatClock((Date.now() - card.startTime) / 1000)}` : "";
  const sheetT = reduced ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.sheet || SPRINGS.default);
  return (
    <div className="ctc-root" role="presentation">
      <motion.div className="ctc-dim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }} />
      <motion.div className="ctc-card" role="dialog" aria-modal="true" aria-label={card.groupName || S.group}
        initial={reduced ? { opacity: 0 } : { y: "110%" }} animate={reduced ? { opacity: 1 } : { y: 0 }} exit={reduced ? { opacity: 0 } : { y: "110%" }} transition={sheetT}
        drag={reduced ? false : "y"} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.05, bottom: 0.6 }}
        onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose?.(); }}>
        <div className="ctc-grab" aria-hidden="true" />
        <div style={{ textAlign: "center" }}><span className="ctc-live">{video ? S.liveVideo : S.live}{elapsed}</span></div>
        {shown.length ? (
          <div className="ctc-avs" aria-hidden="true">
            {shown.map((u) => (
              <span key={u.id} className={`w${u.speaking ? " sp" : ""}`}>
                <Av user={u} s={58} />
                {u.muted ? <i><I n="micoff" s={11} w={2.6} /></i> : null}
              </span>
            ))}
            {extra > 0 ? <span className="w"><span className="ctc-more">+{extra}</span></span> : null}
          </div>
        ) : null}
        <div className="ctc-t">{card.groupName || S.group}</div>
        <div className="ctc-s">{people.length ? fmt(S.talking, { names: joinNames(people.map((u) => u.displayName || u.username), S) }) : (video ? S.groupVideo : S.groupVoice)}</div>
        <div className="ctc-tg">
          <button type="button" className={`ctc-tap${mic ? "" : " off"}`} aria-pressed={mic} aria-label={mic ? S.micOn : S.micOff} onClick={() => setMic((v) => !v)}>
            <I n={mic ? "volume" : "micoff"} s={19} w={2} />{mic ? S.micOn : S.micOff}
          </button>
          <button type="button" className={`ctc-tap${cam ? "" : " off"}`} aria-pressed={cam} aria-label={cam ? S.camOn : S.camOff} onClick={() => setCam((v) => !v)}>
            <I n="cam" s={19} w={2} />{cam ? S.camOn : S.camOff}
          </button>
        </div>
        <button type="button" className="ctc-btn g ctc-tap" onClick={() => onJoin?.({ micOn: mic, cameraOn: cam })}>
          <I n="phone" s={20} w={2.4} />{S.join}
        </button>
        <button type="button" className="ctc-btn gr ctc-tap" onClick={onClose}>{S.notNow}</button>
      </motion.div>
    </div>
  );
}

function EndedScreen({ card, S, onCallBack, onMessage, onClose, reduced }) {
  const video = card.callType === "video";
  const isGroup = !card.peerId && card.groupId;
  const name = card.peerName || card.groupName || "";
  const user = card.peer || { id: card.peerId || card.groupId, username: name, displayName: name };
  const when = card.endedAt || card.startedAt || card.at || Date.now();
  const kindLabel = isGroup ? (video ? S.groupVideo : S.groupVoice) : video ? S.videoCall : S.voiceCall;
  const T = reduced ? REDUCED_MOTION_FADE : framerSpring(SPRINGS.materialize || SPRINGS.default);
  return (
    <motion.div className="ctc-end" role="dialog" aria-modal="true" aria-label={S.ended}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.2 : 0.28 }}>
      <motion.div className="ctc-end-in" initial={reduced ? false : { scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} transition={T}>
        <Av user={user} s={120} style={{ boxShadow: "0 0 0 1px rgba(255,255,255,.15)" }} />
        <h2>{name}</h2>
        <div className="st"><b>{S.ended}</b>{card.duration ? <span>· {formatClock(card.duration)}</span> : null}</div>
        <div className="ctc-log">
          <I n={video ? "cam" : "phone"} s={18} w={2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{kindLabel} · {hm(when)}</div>
            <div className="r">{endReasonText(card, S)}</div>
          </div>
        </div>
        <div className="ctc-row">
          {card.peerId ? (
            <button type="button" className="ctc-rb g ctc-tap" onClick={onCallBack}><span><I n="phone" s={28} w={2.2} /></span>{S.callBack}</button>
          ) : null}
          {onMessage && (card.peerId || card.groupId) ? (
            <button type="button" className="ctc-rb ctc-tap" onClick={onMessage}><span><I n="msg" s={26} w={2} /></span>{S.message}</button>
          ) : null}
          <button type="button" className="ctc-rb ctc-tap" onClick={onClose}><span><I n="x" s={26} w={2.4} /></span>{S.close}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function CallTapCard({ card, onJoin, onCallBack, onMessage, onClose }) {
  const { locale } = useLocale();
  const S = STR[locale === "tr" ? "tr" : "en"];
  const reduced = useReducedMotionPref();
  useEffect(() => {
    if (!card) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, onClose]);
  if (typeof document === "undefined") return null;
  const key = card ? `${card.kind}-${card.groupId || card.peerId || ""}` : null;
  return createPortal(
    <AnimatePresence>
      {card?.kind === "group-join" ? <JoinCard key={key} card={card} S={S} onJoin={onJoin} onClose={onClose} reduced={reduced} /> : null}
      {card && card.kind !== "group-join" ? <EndedScreen key={key} card={card} S={S} onCallBack={onCallBack} onMessage={onMessage} onClose={onClose} reduced={reduced} /> : null}
    </AnimatePresence>,
    document.body
  );
}
