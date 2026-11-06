import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import OverlayPortal from "../ui/OverlayPortal.jsx";
import { SPRINGS, framerSpring, REDUCED_MOTION_FADE } from "../../lib/fluid/springs";
import { hapticImpactLight, hapticSuccess } from "../../lib/fluid/haptics";
import { useT } from "../../context/LocaleContext";
import {
  X, ChevronLeft, Upload, Smartphone, Camera, ImageIcon, Search, RefreshCw,
  ZoomIn, ZoomOut, Loader2, AlertTriangle,
} from "../ui/Icon.jsx";
import { getRotatedCroppedImageFile, getPaddedCroppedImageFile } from "../../lib/cropImage";
import { handoffQrSrc } from "../../api/media";
import {
  pickerTarget, validatePickedFile, isGifFile, clampZoom, zoomFillPercent, zoomBounds, clampCropPosition, cropExceedsMedia,
  serverCropPayload, previewLayout, giphyTiles, GIF_CHIPS, readRecent, pushRecent,
} from "../../lib/profileMediaPicker";
import { masonryColumns } from "../../lib/gifMasonry";
import "../../styles/profile-media-picker.css";
import "../../styles/gif-masonry.css";

// Same public GIPHY key/endpoint as the chat GIF picker (single source: components/chat/GiphyPicker.jsx).
import { GIPHY_API_KEY } from "../chat/GiphyPicker.jsx";
const GIPHY_API_URL = "https://api.giphy.com/v1/gifs";

/** Media frame that shows exactly the crop (live preview card + final preview). */
function CroppedMedia({ pending, fallbackUrl, className = "" }) {
  if (pending?.src) {
    const { wrap, media } = previewLayout(pending.area, pending.rotation, pending.natural);
    return (
      <span className={`amp-media ${className}`}>
        <span style={wrap}><img src={pending.src} alt="" style={media} draggable={false} /></span>
      </span>
    );
  }
  if (fallbackUrl) {
    return <span className={`amp-media ${className}`}><img src={fallbackUrl} alt="" className="amp-media-fill" draggable={false} /></span>;
  }
  return <span className={`amp-media is-empty ${className}`} />;
}

function ProfileCardPreview({ user, displayName, avatar, banner, highlight, t }) {
  const name = displayName || user?.displayName || user?.username || "";
  return (
    <div className="amp-card">
      <div className={`amp-card-banner${highlight === "banner" ? " is-hl" : ""}`}>
        <CroppedMedia pending={banner.pending} fallbackUrl={banner.url} />
      </div>
      <div className={`amp-card-avatar${highlight === "avatar" ? " is-hl" : ""}`}>
        <CroppedMedia pending={avatar.pending} fallbackUrl={avatar.url} />
        {!avatar.pending && !avatar.url ? <span className="amp-card-initial">{name.slice(0, 1).toUpperCase()}</span> : null}
      </div>
      <div className="amp-card-id">
        <b>{name}</b>
        <small>@{String(user?.username || "").toLowerCase()} · {t("amp.online")}</small>
      </div>
      <div className="amp-card-bio">{user?.bio || t("amp.previewBio")}</div>
    </div>
  );
}

/**
 * Profile photo + banner picker. Owner-approved mockups:
 * /workspace/design/avatar-picker-mockups (source, GIF results, crop editor, final preview).
 *
 * @param {object} p
 * @param {"avatar"|"banner"} p.initialTarget
 * @param {boolean} p.isMobile   bottom sheet + camera / photo library tiles
 * @param {object}  p.user       `me` for the preview card
 * @param {string}  p.displayName
 * @param {string}  p.avatarUrl  current saved photo
 * @param {string}  p.bannerUrl  current saved (effective) banner
 * @param {() => void} p.onClose
 * @param {(target: "avatar"|"banner", payload: {file: File, crop: object|null, isGif: boolean}) => Promise<void>} p.onSave
 */
export default function ProfileMediaPicker({ initialTarget = "avatar", isMobile = false, user, displayName, avatarUrl, bannerUrl, onClose, onSave }) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [target, setTarget] = useState(initialTarget === "banner" ? "banner" : "avatar");
  const [step, setStep] = useState("source");
  const [tab, setTab] = useState("upload");
  const [showQr, setShowQr] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Edited but unsaved media per target: { file, src, isGif, natural, area, pixels, rotation, zoom, crop }
  const [pending, setPending] = useState({ avatar: null, banner: null });
  // Editor state for the current target
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // Rotation is off (owner report): no button, no two-finger rotate. Kept as a constant 0 so
  // the crop payload / preview helpers stay shape-compatible.
  const rotation = 0;
  // Picture size at zoom 1 inside the editor (react-easy-crop onMediaLoaded); sets the zoom range.
  const [mediaSize, setMediaSize] = useState(null);
  const zoomRef = useRef(1);
  const [area, setArea] = useState(null);
  const [pixels, setPixels] = useState(null);
  const [draft, setDraft] = useState(null); // { file, src, isGif, natural }
  // GIF tab
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState("trending");
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const [loadingTile, setLoadingTile] = useState("");
  const [recent, setRecent] = useState(() => readRecent(initialTarget));
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const urlsRef = useRef([]);
  const cfg = pickerTarget(target);

  useEffect(() => () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); }, []);
  useEffect(() => { setRecent(readRecent(target)); }, [target]);

  const close = useCallback(() => { if (!busy) onClose?.(); }, [busy, onClose]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  const flash = (key) => { setError(t(key)); setTimeout(() => setError(""), 3500); };

  const startEdit = useCallback(async (file) => {
    const bad = validatePickedFile(file);
    if (bad) { flash(bad); return; }
    const src = URL.createObjectURL(file);
    urlsRef.current.push(src);
    const natural = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
      img.onerror = () => resolve({ width: 1, height: 1 });
      img.src = src;
    });
    setDraft({ file, src, isGif: isGifFile(file), natural });
    setCrop({ x: 0, y: 0 }); setZoom(1); setMediaSize(null); setArea(null); setPixels(null);
    setStep("edit");
    hapticImpactLight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFiles = (list) => { const f = list?.[0]; if (f) startEdit(f); };

  // ── GIF search (debounced) ──
  useEffect(() => {
    if (tab !== "gif" || step !== "source") return undefined;
    const q = query.trim() || GIF_CHIPS.find((c) => c.id === chip)?.q || "";
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setGifLoading(true); setGifError("");
      try {
        const url = q
          ? `${GIPHY_API_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=30&rating=g`
          : `${GIPHY_API_URL}/trending?api_key=${GIPHY_API_KEY}&limit=30&rating=g`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setGifs(giphyTiles(await res.json()));
      } catch (e) {
        if (e?.name !== "AbortError") { setGifs([]); setGifError(t("amp.gifError")); }
      } finally {
        if (!ctrl.signal.aborted) setGifLoading(false);
      }
    }, query ? 320 : 0);
    return () => { clearTimeout(timer); ctrl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, step, query, chip]);

  const pickGif = async (tile) => {
    if (loadingTile) return;
    setLoadingTile(tile.id);
    try {
      const res = await fetch(tile.full);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], `${cfg.fileName}.gif`, { type: "image/gif", lastModified: Date.now() });
      setRecent(pushRecent(target, tile));
      await startEdit(file);
    } catch {
      flash("amp.gifError");
    } finally {
      setLoadingTile("");
    }
  };

  const onCropComplete = useCallback((a, p) => { setArea(a); setPixels(p); }, []);

  const apply = () => {
    if (!draft || !pixels) return;
    setPending((prev) => ({
      ...prev,
      [target]: { ...draft, area, pixels, rotation, zoom, crop, mediaSize },
    }));
    setStep("final");
    hapticImpactLight();
  };

  const reset = () => { setCrop({ x: 0, y: 0 }); setZoom(1); };

  const changeTarget = (next) => {
    const p = pending[next];
    setTarget(next);
    setError("");
    if (p) {
      setDraft({ file: p.file, src: p.src, isGif: p.isGif, natural: p.natural });
      setCrop(p.crop); setZoom(p.zoom); setMediaSize(p.mediaSize || null);
      setStep("edit");
    } else {
      setTab("upload"); setShowQr(false); setStep("source");
    }
  };

  const save = async () => {
    if (busy) return;
    const order = ["avatar", "banner"].filter((k) => pending[k]);
    if (!order.length) { close(); return; }
    setBusy(true); setError("");
    try {
      for (const k of order) {
        const p = pending[k];
        const c = pickerTarget(k);
        let file = p.file;
        let serverCrop = null;
        if (p.isGif) {
          serverCrop = serverCropPayload(p.pixels, p.rotation);
        } else {
          // Zoomed out past the frame edge (contain): transparent margin, so PNG instead of JPEG.
          file = cropExceedsMedia(p.pixels, p.natural)
            ? await getPaddedCroppedImageFile(p.src, p.pixels, {
              mimeType: "image/png", fileName: `${c.fileName}.png`, maxSize: c.maxOutput,
            })
            : await getRotatedCroppedImageFile(p.src, p.pixels, 0, {
              mimeType: "image/jpeg", quality: 0.92, fileName: `${c.fileName}.jpg`, maxSize: c.maxOutput,
            });
        }
        // eslint-disable-next-line no-await-in-loop
        await onSave?.(k, { file, crop: serverCrop, isGif: p.isGif });
        setPending((prev) => ({ ...prev, [k]: null }));
      }
      hapticSuccess();
      onClose?.();
    } catch (e) {
      console.warn("[profile-media-picker] save failed", e);
      setError(t("amp.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (step === "edit") { setStep(pending[target] ? "final" : "source"); return; }
    if (step === "final") { changeTarget(target); }
  };

  const avatarSide = { pending: target === "avatar" && step === "edit" ? { ...draft, area, rotation } : pending.avatar, url: avatarUrl };
  const bannerSide = { pending: target === "banner" && step === "edit" ? { ...draft, area, rotation } : pending.banner, url: bannerUrl };

  const titles = {
    source: target === "avatar" ? t("amp.titleAvatar") : t("amp.titleBanner"),
    gif: t("amp.titleGif"),
    edit: target === "avatar" ? t("amp.editAvatar") : t("amp.editBanner"),
    final: t("amp.finalTitle"),
  };
  const subs = {
    source: t("amp.subSource"),
    gif: t("amp.subGif"),
    edit: target === "avatar" ? t("amp.subEditAvatar") : t("amp.subEditBanner"),
    final: t("amp.subFinal"),
  };
  const headKey = step === "source" && tab === "gif" ? "gif" : step;

  const sheetMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: REDUCED_MOTION_FADE }, exit: { opacity: 0, transition: REDUCED_MOTION_FADE } }
    : isMobile
      ? { initial: { y: "100%" }, animate: { y: 0, transition: framerSpring(SPRINGS.default) }, exit: { y: "100%", transition: framerSpring(SPRINGS.default) } }
      : { initial: { opacity: 0, scale: 0.96, y: 10 }, animate: { opacity: 1, scale: 1, y: 0, transition: framerSpring(SPRINGS.materialize) }, exit: { opacity: 0, scale: 0.97, transition: { duration: 0.16 } } };
  const stepMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: REDUCED_MOTION_FADE }
    : { initial: { opacity: 0, x: 14 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -14 }, transition: framerSpring(SPRINGS.default) };

  const cropSize = isMobile
    ? (target === "avatar" ? { width: 250, height: 250 } : { width: 318, height: 106 })
    : (target === "avatar" ? { width: 280, height: 280 } : { width: 432, height: 144 });
  // Minimum zoom = the whole picture fits inside the frame edge to edge (contain).
  const zb = zoomBounds(mediaSize, cropSize);
  zoomRef.current = zoom;
  const applyZoom = (z) => {
    const nz = clampZoom(z, zb.min, zb.max);
    zoomRef.current = nz;
    setZoom(nz);
    setCrop((c) => clampCropPosition(c, mediaSize, cropSize, nz));
  };

  const renderSource = () => (
    <>
      <div className="amp-seg" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "upload"} className={tab === "upload" ? "is-on" : ""} onClick={() => setTab("upload")}>{t("amp.tabUpload")}</button>
        <button type="button" role="tab" aria-selected={tab === "gif"} className={tab === "gif" ? "is-on" : ""} onClick={() => setTab("gif")}>{t("amp.tabGif")}</button>
      </div>
      {tab === "upload" ? (
        <>
          <div className="amp-tiles">
            <button type="button" className="amp-tile" onClick={() => fileRef.current?.click()}>
              <span className="amp-tile-ic">{isMobile ? <ImageIcon size={22} /> : <Upload size={22} />}</span>
              <b>{isMobile ? t("amp.fromLibrary") : t("amp.fromComputer")}</b>
              <small>{isMobile ? t("amp.fromLibrarySub") : t("amp.fromComputerSub")}</small>
            </button>
            {isMobile ? (
              <button type="button" className="amp-tile" onClick={() => cameraRef.current?.click()}>
                <span className="amp-tile-ic"><Camera size={22} /></span>
                <b>{t("amp.camera")}</b>
                <small>{t("amp.cameraSub")}</small>
              </button>
            ) : (
              <button type="button" className={`amp-tile${showQr ? " is-qr" : ""}`} onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
                {showQr ? (
                  <span className="amp-qr"><img src={handoffQrSrc(target)} alt={t("amp.qrAlt")} width={112} height={112} /><small>{t("amp.qrHint")}</small></span>
                ) : (
                  <>
                    <span className="amp-tile-ic"><Smartphone size={22} /></span>
                    <b>{t("amp.fromPhone")}</b>
                    <small>{t("amp.fromPhoneSub")}</small>
                  </>
                )}
              </button>
            )}
          </div>
          {!isMobile && (
            <div
              className={`amp-drop${dragOver ? " is-over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFiles(e.dataTransfer?.files); }}
            >
              {t("amp.dropHint")}
            </div>
          )}
          {recent.length > 0 && (
            <>
              <div className="amp-label">{t("amp.recent")}</div>
              <div className="amp-recent">
                {recent.slice(0, isMobile ? 5 : 7).map((r) => (
                  <button key={r.full} type="button" className={`amp-recent-item${target === "banner" ? " is-wide" : ""}`} onClick={() => pickGif(r)} aria-label={t("amp.useRecent")}>
                    <img src={r.preview} alt="" loading="lazy" />
                    {loadingTile === r.id ? <span className="amp-tile-busy"><Loader2 size={18} className="amp-spin" /></span> : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <label className="amp-search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("amp.searchPlaceholder")} aria-label={t("amp.searchPlaceholder")} />
            {query ? <button type="button" className="amp-search-clear" onClick={() => setQuery("")} aria-label={t("amp.clear")}><X size={14} /></button> : null}
          </label>
          <div className="amp-chips">
            {GIF_CHIPS.map((c) => (
              <button key={c.id} type="button" className={chip === c.id && !query ? "is-on" : ""} onClick={() => { setChip(c.id); setQuery(""); }}>{t(c.label)}</button>
            ))}
          </div>
          <div className="amp-label">{query.trim() ? t("amp.resultsFor", { q: query.trim() }) : t(GIF_CHIPS.find((c) => c.id === chip)?.label || "amp.chipTrending")}</div>
          <div className="amp-gif-scroll">
            {gifError ? <p className="amp-empty">{gifError}</p> : null}
            {!gifError && !gifLoading && gifs.length === 0 ? <p className="amp-empty">{t("amp.noResults")}</p> : null}
            {/* Masonry by each GIF's real GIPHY size: constant gaps, no holes under short GIFs. */}
            <div className={`amp-gif-grid gif-masonry${isMobile ? " is-3" : ""}`} aria-busy={gifLoading || undefined}>
              {masonryColumns(gifs, isMobile ? 3 : 4).map((col, ci) => (
                <div className="gif-masonry-col" key={ci}>
                  {col.map(({ item: g }) => (
                    <button key={g.id} type="button" className={`amp-gif${loadingTile === g.id ? " is-sel" : ""}`} style={{ aspectRatio: `${g.width} / ${g.height}` }} onClick={() => pickGif(g)} aria-label={g.title || t("amp.tabGif")}>
                      <img src={g.preview} alt="" loading="lazy" width={g.width} height={g.height} />
                      <span className="amp-gif-tag">{t("amp.gifTag")}</span>
                      {loadingTile === g.id ? <span className="amp-tile-busy"><Loader2 size={20} className="amp-spin" /></span> : null}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderEdit = () => (
    <div className="amp-edit">
      <div className="amp-edit-main">
        <div className={`amp-crop is-${target}`}>
          {draft ? (
            <Cropper
              image={draft.src}
              crop={crop}
              zoom={zoom}
              rotation={0}
              aspect={cfg.aspect}
              cropShape={cfg.shape === "round" ? "round" : "rect"}
              cropSize={cropSize}
              showGrid
              minZoom={zb.min}
              maxZoom={zb.max}
              restrictPosition={false}
              onCropChange={(c) => setCrop(clampCropPosition(c, mediaSize, cropSize, zoomRef.current))}
              onZoomChange={applyZoom}
              onMediaLoaded={(m) => setMediaSize({ width: m.width, height: m.height })}
              onCropComplete={onCropComplete}
              objectFit="cover"
            />
          ) : null}
          {draft?.isGif ? <span className="amp-pill is-tl"><span className="amp-live-dot" />{t("amp.gifLooping")}</span> : null}
          <span className="amp-pill is-bc">{t("amp.dragHint")}</span>
        </div>
        <div className="amp-ctrl">
          <div className="amp-zoom">
            <ZoomOut size={16} aria-hidden />
            <input type="range" min={zb.min} max={zb.max} step={0.01} value={zoom} onChange={(e) => applyZoom(e.target.value)} style={{ "--amp-zoom": `${zoomFillPercent(zoom, zb.min, zb.max)}%`, "--amp-p": zoomFillPercent(zoom, zb.min, zb.max) / 100 }} aria-label={t("amp.zoom")} />
            <ZoomIn size={16} aria-hidden />
          </div>
          <button type="button" className="amp-ibtn" onClick={reset}><RefreshCw size={15} />{t("amp.reset")}</button>
        </div>
      </div>
      <div className="amp-edit-side">
        <div className="amp-label is-first">{t("amp.livePreview")}</div>
        <ProfileCardPreview user={user} displayName={displayName} avatar={avatarSide} banner={bannerSide} highlight={target} t={t} />
        {!isMobile ? <p className="amp-note">{t("amp.liveNote")}</p> : null}
      </div>
    </div>
  );

  const rowFor = (k) => {
    const p = pending[k];
    const kind = p ? (p.isGif ? t("amp.kindGif") : t("amp.kindImage")) : t("amp.kindCurrent");
    const shape = k === "avatar" ? t("amp.shapeRound") : t("amp.shapeWide");
    return (
      <div className="amp-row" key={k}>
        <span className={`amp-row-thumb is-${k}`}>
          <CroppedMedia pending={p} fallbackUrl={k === "avatar" ? avatarUrl : bannerUrl} />
        </span>
        <span className="amp-row-text">
          <b>{k === "avatar" ? t("amp.rowAvatar") : t("amp.rowBanner")}</b>
          <small>{p ? `${kind} · ${shape}` : kind}</small>
        </span>
        <button type="button" className="amp-ibtn" onClick={() => changeTarget(k)} disabled={busy}>{t("amp.change")}</button>
      </div>
    );
  };

  const renderFinal = () => (
    <div className="amp-final">
      <div className="amp-final-card">
        <ProfileCardPreview user={user} displayName={displayName} avatar={{ pending: pending.avatar, url: avatarUrl }} banner={{ pending: pending.banner, url: bannerUrl }} t={t} />
      </div>
      <div className="amp-rows">{rowFor("avatar")}{rowFor("banner")}</div>
    </div>
  );

  const footer = step === "edit" ? (
    <div className="amp-foot">
      <button type="button" className="amp-btn is-ghost" onClick={back}>{t("amp.cancel")}</button>
      <button type="button" className="amp-btn is-primary" onClick={apply} disabled={!pixels}>{t("amp.apply")}</button>
    </div>
  ) : step === "final" ? (
    <div className="amp-foot">
      {!isMobile ? <button type="button" className="amp-btn is-ghost" onClick={close} disabled={busy}>{t("amp.cancel")}</button> : null}
      <button type="button" className="amp-btn is-primary" onClick={save} disabled={busy}>
        {busy ? <Loader2 size={16} className="amp-spin" /> : null}{busy ? t("amp.saving") : t("amp.save")}
      </button>
    </div>
  ) : null;


  return (
    <OverlayPortal>
      <motion.div className={`amp-scrim${isMobile ? " is-mobile" : ""}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
        <motion.div
          className={`amp-sheet${isMobile ? " is-mobile" : ""} is-step-${step}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="amp-title"
          onClick={(e) => e.stopPropagation()}
          {...sheetMotion}
        >
          {isMobile ? <span className="amp-grab" aria-hidden /> : null}
          <header className="amp-head">
            {step !== "source" ? (
              <button type="button" className="amp-round" onClick={back} aria-label={t("amp.back")} disabled={busy}><ChevronLeft size={18} /></button>
            ) : null}
            <div className="amp-head-text">
              <h2 id="amp-title">{titles[headKey]}</h2>
              <p>{subs[headKey]}</p>
            </div>
            {!(isMobile && step !== "source") ? (
              <button type="button" className="amp-round" onClick={close} aria-label={t("amp.close")} disabled={busy}><X size={16} /></button>
            ) : null}
          </header>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${step}-${tab}-${target}`} className="amp-body" {...stepMotion}>
              {step === "source" ? renderSource() : step === "edit" ? renderEdit() : renderFinal()}
            </motion.div>
          </AnimatePresence>
          {error ? <p className="amp-error" role="alert"><AlertTriangle size={14} />{error}</p> : null}
          {footer}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="amp-hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <input ref={cameraRef} type="file" accept="image/*" capture="user" className="amp-hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </motion.div>
      </motion.div>
    </OverlayPortal>
  );
}
