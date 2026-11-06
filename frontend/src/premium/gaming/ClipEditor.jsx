/* Instant clip editor: preview, trim (keyframe-aligned, no re-encode), send to a chat or save. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { clampTrim, defaultTrim } from "./clipRing.js";
import { clipFileName, muxClip } from "./instantClip.js";
import { closeClipEditor } from "./clipController.js";
import { pinvoke, useAppBridge } from "./bridge.js";
import { recentTargets, sendFileTo } from "./sendMedia.js";
import { X } from "../../components/ui/Icon.jsx";
import { createPortal } from "react-dom";
import "./gaming.css";

export default function ClipEditor({ snap, socket }) {
  const t = useT();
  const app = useAppBridge();
  const length = snap.lengthMs;
  const [trim, setTrim] = useState(() => clampTrim(defaultTrim(snap.chunks, 30), length));
  const [url, setUrl] = useState("");
  const [state, setState] = useState("muxing");
  const targets = useMemo(() => recentTargets({ dms: app.recentDms?.map((d) => d.user) || [], groups: app.groups || [], channels: app.textChannels || [] }), [app.recentDms, app.groups, app.textChannels]);
  const [target, setTarget] = useState("");
  const videoRef = useRef(null);

  useEffect(() => { if (!target && targets[0]) setTarget(targets[0].id); }, [targets, target]);

  // Preview the whole snapshot once; the trim handles seek inside it.
  useEffect(() => {
    let live = true;
    let made = "";
    muxClip(snap, 0, length).then((blob) => {
      if (!live) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
      setState("ready");
    }).catch(() => live && setState("error"));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [snap, length]);

  const seek = (ms) => { if (videoRef.current) videoRef.current.currentTime = ms / 1000; };
  const exportFile = async () => {
    const blob = await muxClip(snap, trim.from, trim.to);
    return new File([blob], clipFileName(snap), { type: blob.type });
  };
  const send = async () => {
    setState("sending");
    try {
      const file = await exportFile();
      await sendFileTo(socket, target, file);
      setState("sent");
      setTimeout(closeClipEditor, 900);
    } catch {
      setState("sendError");
    }
  };
  const save = async () => {
    try {
      const file = await exportFile();
      await pinvoke("premium:instant_clip:save-file", file.name, await file.arrayBuffer());
    } catch { setState("sendError"); }
  };
  const sec = (ms) => (ms / 1000).toFixed(1);
  return createPortal((
    <div className="pg-modal-backdrop" data-testid="pg-clip-editor">
      <div className="pg-modal pg-clip" role="dialog" aria-modal="true" aria-label={t("premiumGaming.instantClip.editor.title")}>
        <div className="pg-modal-head">
          <h2>{t("premiumGaming.instantClip.editor.title")}</h2>
          <button type="button" className="pg-btn is-small" onClick={closeClipEditor} aria-label={t("premiumGaming.common.close")}><X size={14} /></button>
        </div>
        {state === "muxing" ? <p className="pg-muted">{t("premiumGaming.instantClip.editor.muxing")}</p> : null}
        {state === "error" ? <p className="pg-error">{t("premiumGaming.instantClip.editor.failed")}</p> : null}
        {url ? <video ref={videoRef} src={url} controls muted playsInline /> : null}
        <div className="pg-card" style={{ marginTop: 12 }}>
          <label className="pg-row">
            <span className="pg-label" style={{ width: 70 }}>{t("premiumGaming.instantClip.editor.start")}</span>
            <input className="pg-range pg-grow" type="range" min="0" max={length} step="100" value={trim.from} onChange={(e) => { const n = clampTrim({ from: Number(e.target.value), to: trim.to }, length); setTrim(n); seek(n.from); }} />
            <span className="pg-num pg-muted">{sec(trim.from)}</span>
          </label>
          <label className="pg-row">
            <span className="pg-label" style={{ width: 70 }}>{t("premiumGaming.instantClip.editor.end")}</span>
            <input className="pg-range pg-grow" type="range" min="0" max={length} step="100" value={trim.to} onChange={(e) => { const n = clampTrim({ from: trim.from, to: Number(e.target.value) }, length); setTrim(n); seek(n.to); }} />
            <span className="pg-num pg-muted">{sec(trim.to)}</span>
          </label>
          <span className="pg-muted">{t("premiumGaming.instantClip.editor.length", { seconds: sec(trim.to - trim.from) })} · {t("premiumGaming.instantClip.editor.keyframeNote")}</span>
        </div>
        <div className="pg-row" style={{ marginTop: 12 }}>
          <span className="pg-label">{t("premiumGaming.instantClip.editor.sendTo")}</span>
          <select className="pg-select pg-grow" value={target} onChange={(e) => setTarget(e.target.value)}>
            {!targets.length ? <option value="">{t("premiumGaming.quickDrop.noTargets")}</option> : null}
            {targets.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <button type="button" className="pg-btn is-primary" disabled={!target || state === "sending" || state === "muxing"} onClick={send}>{t("premiumGaming.instantClip.editor.send")}</button>
          <button type="button" className="pg-btn" disabled={state === "muxing"} onClick={save}>{t("premiumGaming.instantClip.editor.saveFile")}</button>
        </div>
        {state === "sending" ? <p className="pg-muted">{t("premiumGaming.common.sending")}</p> : null}
        {state === "sent" ? <p className="pg-ok">{t("premiumGaming.instantClip.editor.sent")}</p> : null}
        {state === "sendError" ? <p className="pg-error">{t("premiumGaming.instantClip.editor.sendFailed")}</p> : null}
      </div>
    </div>
  ), document.body);
}
