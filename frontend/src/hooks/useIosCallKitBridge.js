import { useEffect, useRef } from "react";
import audioManager from "../lib/audioManager";
import { pulseCallWakeLock } from "../lib/callWakeLock";
import {
  IOS_NATIVE,
  callKitPlugin,
  initIosCallKit,
  newCallUuid,
  onCallKitEvent,
  syncIosVoipToken,
  cleanupStaleVoipToken,
} from "../lib/iosCallKit";
import { createCallKitController } from "../lib/iosCallKitController";
import { setCallKitFallback, subscribeCallKitUi, getCallKitUiSnapshot } from "../lib/iosCallKitState";

/**
 * Native iOS only: keeps CallKit in step with the DM call from useCall().
 * Does nothing at all on web, Electron and Android.
 */
export function useIosCallKitBridge({ call, socket, meId }) {
  const callRef = useRef(call);
  const socketRef = useRef(socket);
  callRef.current = call;
  socketRef.current = socket;
  const controllerRef = useRef(null);

  if (IOS_NATIVE && !controllerRef.current) {
    controllerRef.current = createCallKitController({
      plugin: callKitPlugin,
      getCall: () => callRef.current,
      getSocket: () => socketRef.current,
      newUuid: newCallUuid,
      onFallbackRing: (on) => {
        setCallKitFallback(on);
        if (on && callRef.current?.mode === "incoming") audioManager.play("incomingCall", { loop: true });
        if (!on) audioManager.stop("incomingCall");
      },
      onAudioSessionActivated: () => {
        pulseCallWakeLock();
        const audio = callRef.current?.remoteAudioRef?.current;
        if (audio) {
          try {
            audio.muted = false;
            const p = audio.play();
            if (p?.catch) p.catch(() => {});
          } catch {
            /* ignore */
          }
        }
      },
      log: (...args) => console.warn("[CallKit]", ...args),
    });
  }

  // CallKit events + late enable (stop an in-app ring that started before init finished).
  useEffect(() => {
    if (!IOS_NATIVE) return undefined;
    const off = onCallKitEvent((name, data) => controllerRef.current?.handleEvent(name, data));
    void initIosCallKit();
    const unsub = subscribeCallKitUi(() => {
      const snap = getCallKitUiSnapshot();
      if (snap.enabled && !snap.fallback && callRef.current?.mode === "incoming") {
        audioManager.stop("incomingCall");
      }
      controllerRef.current?.sync();
    });
    return () => {
      off();
      unsub();
    };
  }, []);

  // Register the VoIP token once signed in.
  useEffect(() => {
    if (!IOS_NATIVE || !meId) return;
    void initIosCallKit().then((ok) => (ok ? syncIosVoipToken() : cleanupStaleVoipToken()));
  }, [meId]);

  // Mirror useCall state into CallKit.
  useEffect(() => {
    if (!IOS_NATIVE || !getCallKitUiSnapshot().enabled) return;
    controllerRef.current?.sync();
  }, [call?.mode, call?.peer?.id, call?.callUuid, call?.muted]);

  // Socket signals CallKit needs (listeners are added only on native iOS).
  useEffect(() => {
    if (!IOS_NATIVE || !socket) return undefined;
    const ctl = () => (getCallKitUiSnapshot().enabled ? controllerRef.current : null);
    const onConnect = () => ctl()?.onSocketConnect();
    const onRemote = ({ fromUserId } = {}) => ctl()?.onRemoteEnded(fromUserId);
    const onAnsweredElsewhere = (p) => ctl()?.onHandledElsewhere("answered", p);
    const onDeclinedElsewhere = (p) => ctl()?.onHandledElsewhere("declined", p);
    const onResume = (p) => ctl()?.onResumeResult(p);
    const onOffer = (p) => ctl()?.onOfferSeen(p);
    socket.on("connect", onConnect);
    socket.on("call:cancelled", onRemote);
    socket.on("call:ended", onRemote);
    socket.on("call:declined", onRemote);
    socket.on("call:answered-elsewhere", onAnsweredElsewhere);
    socket.on("call:declined-elsewhere", onDeclinedElsewhere);
    socket.on("call:resume-pending:result", onResume);
    socket.on("call:offer", onOffer);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("call:cancelled", onRemote);
      socket.off("call:ended", onRemote);
      socket.off("call:declined", onRemote);
      socket.off("call:answered-elsewhere", onAnsweredElsewhere);
      socket.off("call:declined-elsewhere", onDeclinedElsewhere);
      socket.off("call:resume-pending:result", onResume);
      socket.off("call:offer", onOffer);
    };
  }, [socket]);
}
