import { useEffect, useState, useSyncExternalStore } from "react";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { getNativeCallSnapshot, nativeHangup, nativeSetMuted, subscribeNativeCall } from "../../lib/iosNativeCall";
import { nativeCallStatusLabel } from "../../lib/iosNativeCallState";
import { setCallAudioRoute } from "../../lib/iosNativeCallRoute";
import "./NativeCallCard.css";

/**
 * iOS: the DM call answered on the lock screen keeps running natively
 * (DescallNativeCall.swift). When the user opens Descall during that call,
 * this Liquid Glass card shows it and controls it: mute, speaker, hang up.
 */
export default function NativeCallCard() {
  const call = useSyncExternalStore(subscribeNativeCall, getNativeCallSnapshot, getNativeCallSnapshot);
  const [now, setNow] = useState(() => Date.now());
  const [speaker, setSpeaker] = useState(true);

  useEffect(() => {
    if (!call.active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [call.active]);

  if (!call.active) return null;
  const status = nativeCallStatusLabel(call, now);
  const initial = (call.callerName || "?").trim().charAt(0).toLocaleUpperCase("tr-TR") || "?";

  return (
    <div className="native-call-card" role="dialog" aria-live="polite" aria-label={`${call.callerName} ile arama`}>
      <div className={`native-call-avatar${call.phase === "connected" ? " is-live" : ""}`} aria-hidden="true">
        {initial}
      </div>
      <div className="native-call-text">
        <div className="native-call-name">{call.callerName}</div>
        <div className="native-call-status">{status}</div>
      </div>
      <div className="native-call-actions">
        <button
          type="button"
          className={`native-call-btn${call.muted ? " is-on" : ""}`}
          aria-pressed={call.muted}
          onClick={() => void nativeSetMuted(!call.muted)}
        >
          {call.muted ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
          <span className="native-call-btn-label">Sessiz</span>
        </button>
        <button
          type="button"
          className={`native-call-btn${speaker ? " is-on" : ""}`}
          aria-pressed={speaker}
          onClick={() => {
            const next = !speaker;
            setSpeaker(next);
            void setCallAudioRoute(next ? "speaker" : "receiver");
          }}
        >
          <Volume2 size={20} aria-hidden="true" />
          <span className="native-call-btn-label">Hoparlör</span>
        </button>
        <button type="button" className="native-call-btn is-end" onClick={() => void nativeHangup()}>
          <PhoneOff size={20} aria-hidden="true" />
          <span className="native-call-btn-label">Kapat</span>
        </button>
      </div>
    </div>
  );
}
