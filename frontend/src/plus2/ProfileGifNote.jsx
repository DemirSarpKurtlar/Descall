/**
 * Moment 4 (profile editor, free account with an animated avatar / banner from before): "GIF
 * avatarın korunuyor". Shown once per account (paywall "once" rule), only where Descall+ is on
 * sale. "İstek listeme ekle" shows Descall+ to friends as a gift idea (hub gift column).
 */
import { useEffect, useState } from "react";
import { useT } from "../context/LocaleContext";
import { Gift } from "../components/ui/Icon.jsx";
import { useGifGate } from "./GifOffer.jsx";
import { decidePaywall, setPrefs, trackPaywall } from "./plusApi.js";
import "./plus2.css";

export function isGifUrl(url) {
  return typeof url === "string" && /\.gif($|[?#])/i.test(url);
}

export default function ProfileGifNote({ avatarUrl, bannerUrl }) {
  const t = useT();
  const { gated } = useGifGate();
  const hasGif = isGifUrl(avatarUrl) || isGifUrl(bannerUrl);
  const [show, setShow] = useState(false);
  const [wished, setWished] = useState(false);
  useEffect(() => {
    if (!gated || !hasGif) return undefined;
    let alive = true;
    decidePaywall("profile_gif_note").then((v) => { if (alive) setShow(v?.show === "full"); }).catch(() => {});
    return () => { alive = false; };
  }, [gated, hasGif]);
  if (!show) return null;
  const done = () => {
    setShow(false);
    setPrefs({ gifNoteSeen: true }).catch(() => {});
    trackPaywall("profile_gif_note", "dismissed");
  };
  const wish = () => {
    setWished(true);
    setPrefs({ wishlist: true, gifNoteSeen: true }).catch(() => {});
    trackPaywall("profile_gif_note", "clicked", { meta: { wishlist: true } });
  };
  return (
    <div className="p2" style={{ margin: "10px 0" }}>
      <div className="p2-moment is-teal" role="note">
        <div className="p2-h" style={{ color: "color-mix(in srgb, var(--p2-teal) 75%, var(--text-0))" }}>{t(isGifUrl(avatarUrl) ? "plus2.note.avatarTitle" : "plus2.note.bannerTitle")}</div>
        <div className="p2-small" style={{ color: "var(--p2-t2)" }}>{t("plus2.note.body")}</div>
        <div className="p2-row">
          <button type="button" className="p2-btn is-sm" onClick={done}>{t("plus2.note.ok")}</button>
          <button type="button" className="p2-btn is-sm is-ghost" onClick={wish} disabled={wished}><Gift />{wished ? t("plus2.note.wished") : t("plus2.note.wish")}</button>
        </div>
      </div>
    </div>
  );
}
