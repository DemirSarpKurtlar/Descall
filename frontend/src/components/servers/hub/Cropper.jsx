/* 05: full-screen icon/banner cropper (pan + pinch/wheel zoom) with the server-list preview pill. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Btn, Layer, Sq } from "./kit";
import { useSvh } from "./useSvh";
import { loadImage, getCroppedImageFile } from "../../../lib/cropImage";
import { useReducedMotionPref } from "./useHubMode";

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

export default function Cropper({ src, kind = "icon", onCancel, onConfirm, busy }) {
  const { s } = useSvh();
  const reduced = useReducedMotionPref();
  const { w: W, h: H } = useViewport();
  const phone = W < 700;
  const icon = kind === "icon";
  const D = phone ? 320 : 440;
  const fw = icon ? D : Math.min(W - 40, phone ? 350 : 640);
  const fh = icon ? D : Math.round(fw / 2.5);
  const cx = W / 2;
  const cy = H / 2 - 20;
  const [img, setImg] = useState(null);
  const [t, setT] = useState(null); // { x, y, k } image left/top in px + scale
  const pointers = useRef(new Map());
  const gesture = useRef(null);

  useEffect(() => {
    let live = true;
    loadImage(src).then((im) => { if (live) setImg({ el: im, w: im.naturalWidth || im.width, h: im.naturalHeight || im.height }); }).catch(() => onCancel?.());
    return () => { live = false; };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

  const minK = img ? Math.max(fw / img.w, fh / img.h) : 1;
  const clamp = useCallback((n) => {
    if (!img) return n;
    const k = Math.max(minK, Math.min(minK * 8, n.k));
    const iw = img.w * k, ih = img.h * k;
    const x = Math.min(cx - fw / 2, Math.max(cx + fw / 2 - iw, n.x));
    const y = Math.min(cy - fh / 2, Math.max(cy + fh / 2 - ih, n.y));
    return { x, y, k };
  }, [img, minK, cx, cy, fw, fh]);

  useLayoutEffect(() => {
    if (!img) return;
    // Kit start state: the image spans 1.5× the crop frame, centred.
    const k = minK * 1.5;
    setT(clamp({ k, x: cx - (img.w * k) / 2, y: cy - (img.h * k) / 2 }));
  }, [img, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (factor, px, py) => setT((cur) => {
    if (!cur) return cur;
    const k = Math.max(minK, Math.min(minK * 8, cur.k * factor));
    const f = k / cur.k;
    return clamp({ k, x: px - (px - cur.x) * f, y: py - (py - cur.y) * f });
  });

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = null;
  };
  const onMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !t) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      setT((cur) => clamp({ ...cur, x: cur.x + (e.clientX - prev.x), y: cur.y + (e.clientY - prev.y) }));
    } else if (pts.length >= 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const g = gesture.current;
      if (g) {
        const f = dist / (g.dist || dist);
        setT((cur) => {
          const k = Math.max(minK, Math.min(minK * 8, cur.k * f));
          const ff = k / cur.k;
          return clamp({ k, x: mid.x - (mid.x - cur.x) * ff + (mid.x - g.mid.x), y: mid.y - (mid.y - cur.y) * ff + (mid.y - g.mid.y) });
        });
      }
      gesture.current = { dist, mid };
    }
  };
  const onUp = (e) => { pointers.current.delete(e.pointerId); gesture.current = null; };
  const onWheel = (e) => { zoomAt(e.deltaY < 0 ? 1.08 : 1 / 1.08, e.clientX, e.clientY); };

  const crop = t && img ? { x: (cx - fw / 2 - t.x) / t.k, y: (cy - fh / 2 - t.y) / t.k, width: fw / t.k, height: fh / t.k } : null;
  const confirm = async () => {
    if (!crop || busy) return;
    const file = await getCroppedImageFile(src, crop, { mimeType: "image/jpeg", fileName: icon ? "server-icon.jpg" : "server-banner.jpg", maxSize: icon ? 512 : 1600 });
    onConfirm?.(file);
  };
  const prev = (q) => {
    if (!crop || !img) return undefined;
    const r = q / fw; // preview px per frame px
    return `url("${src}") ${-crop.x * t.k * r}px ${-crop.y * t.k * r}px / ${img.w * t.k * r}px ${img.h * t.k * r}px no-repeat`;
  };
  const hole = icon
    ? `radial-gradient(circle at ${cx}px ${cy}px, transparent ${D / 2}px, rgba(0,0,0,.62) ${D / 2 + 1}px)`
    : null;
  return (
    <Layer onClose={onCancel} z={10080} label={icon ? s.cropTitle : s.bannerCropTitle}>
      <motion.div style={{ position: "absolute", inset: 0, background: "#000", touchAction: "none" }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.2 : 0.24 }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}>
        {t && img ? (
          <img src={src} alt="" draggable="false" style={{ position: "absolute", left: t.x, top: t.y, width: img.w * t.k, height: img.h * t.k, opacity: 0.95, userSelect: "none", pointerEvents: "none", maxWidth: "none" }} />
        ) : null}
        {icon ? (
          <>
            <div style={{ position: "absolute", inset: 0, background: hole, pointerEvents: "none" }} />
            <div style={{ position: "absolute", left: cx - D / 2, top: cy - D / 2, width: D, height: D, borderRadius: "50%", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.85)", pointerEvents: "none" }} />
          </>
        ) : (
          <div style={{ position: "absolute", left: cx - fw / 2, top: cy - fh / 2, width: fw, height: fh, borderRadius: 16, boxShadow: "0 0 0 9999px rgba(0,0,0,.62), inset 0 0 0 1.5px rgba(255,255,255,.85)", pointerEvents: "none" }} />
        )}
        <div style={{ position: "absolute", top: phone ? 64 : 36, left: 0, right: 0, textAlign: "center", fontSize: 17, fontWeight: 650, pointerEvents: "none" }}>{icon ? s.cropTitle : s.bannerCropTitle}</div>
        <div style={{ position: "absolute", top: phone ? 88 : 60, left: 0, right: 0, textAlign: "center", fontSize: 13.5, color: "rgba(235,238,255,.6)", pointerEvents: "none" }}>{icon ? s.cropSub : s.bannerCropSub}</div>
        {icon ? (
          <div className="svh-heavy" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: phone ? 112 : 96, display: "flex", gap: 16, alignItems: "center", padding: "10px 16px", borderRadius: 22, pointerEvents: "none", whiteSpace: "nowrap" }}>
            <Sq txt="" s={44} bg={prev(44)} /><Sq txt="" s={32} bg={prev(32)} /><Sq txt="" s={22} bg={prev(22)} />
            <span style={{ fontSize: 13, color: "rgba(235,238,255,.6)" }}>{s.cropPreview}</span>
          </div>
        ) : null}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: phone ? 40 : 30, display: "flex", justifyContent: "space-between", padding: `0 ${phone ? 22 : 300}px` }} onPointerDown={(e) => e.stopPropagation()}>
          <Btn variant="gray" sm style={{ height: 44, borderRadius: 22, padding: "0 22px" }} onClick={onCancel}>{s.cancel}</Btn>
          <Btn sm style={{ height: 44, borderRadius: 22, padding: "0 26px" }} onClick={confirm} disabled={busy || !crop}>{s.choose}</Btn>
        </div>
      </motion.div>
    </Layer>
  );
}
