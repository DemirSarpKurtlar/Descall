/**
 * Animated avatar / banner for a free account (owner request 27 Nov; draft 5B moments 4 and 5).
 * Never an error: the person picks their GIF and sees it moving on their own profile card, in a
 * chat row and in a member list (a live preview only they see), then chooses:
 *   "3 gün ücretsiz dene"   the trial (once per account) through the normal checkout,
 *   "Hediye iste"           a gentle ask to one friend (one a week; the friend can turn asks off),
 *                           also puts Descall+ on their wish list,
 *   "İlk kareyi sabit olarak kullan"  the picture as a still, saved right away (never blocked).
 * The full offer shows once a day (paywall budget); after that a compact line. Every step is a
 * paywall-funnel event (moment "gif_upload").
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import { Gift, Sparkles, Image as ImageIcon, Check, Loader2 } from "../components/ui/Icon.jsx";
import { usePremium } from "../premium/usePremium.js";
import { usePlus, refreshHub } from "./plusStore.js";
import { askForGift, decidePaywall, setPrefs, trackPaywall } from "./plusApi.js";
import { openPlus } from "./openPlus.js";
import { errorKey } from "./model.js";
import { PAvatar } from "./ui.jsx";
import "./plus2.css";

/** True when a new animated avatar / banner needs Descall+ here (selling on, gate on, not a member). */
export function useGifGate() {
  const { offer } = usePlus({ load: "offer" });
  const { plan } = usePremium();
  const gated = Boolean(offer?.salesOn && offer?.features?.animatedGate && !plan);
  return { gated, offer, plan };
}

/** Small note on the picker's GIF tab (shown before anything is picked). */
export function GifTabNote() {
  const t = useT();
  const { gated } = useGifGate();
  if (!gated) return null;
  return (
    <div className="p2" style={{ margin: "0 0 10px" }}>
      <div className="p2-moment is-teal" style={{ padding: "9px 12px" }}>
        <span className="p2-small"><b>{t("plus2.gif.tabTitle")}</b> {t("plus2.gif.tabBody")}</span>
      </div>
    </div>
  );
}

export default function GifOffer({ kind = "avatar", user, renderMedia, onFirstFrame, busy = false }) {
  const t = useT();
  const { offer } = useGifGate();
  const { hub } = usePlus({ load: "hub" });
  const [verdict, setVerdict] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askTo, setAskTo] = useState("");
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState(false);
  const [err, setErr] = useState(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    decidePaywall("gif_upload").then(setVerdict).catch(() => setVerdict({ show: "full" }));
  }, []);

  const name = user?.displayName || user?.display_name || user?.username || "";
  const friends = (hub?.friends || []).filter((f) => !f.plan);
  const trialOk = offer?.features?.trial && !hub?.me?.trialUsed;
  const compact = verdict?.show === "compact";

  const tryIt = () => {
    trackPaywall("gif_upload", "clicked", { meta: { kind, action: "trial" } });
    openPlus({ view: "checkout", tab: "self", plan: "plus", moment: "gif_upload" });
  };
  const ask = async () => {
    if (!askTo) return;
    setAsking(true);
    setErr(null);
    try {
      await askForGift(askTo, "animated_profile");
      await setPrefs({ wishlist: true }).catch(() => null);
      setAsked(true);
      setAskOpen(false);
      refreshHub();
    } catch (e) {
      setErr(errorKey(e?.code));
    } finally {
      setAsking(false);
    }
  };
  const still = () => {
    trackPaywall("gif_upload", "first_frame", { meta: { kind } });
    onFirstFrame?.();
  };

  const media = renderMedia?.(kind);
  return (
    <div className="p2 p2-gif" aria-live="polite">
      <div className="p2-row">
        <span className="p2-gif-live">{t("plus2.gif.live")}</span>
        <span className="p2-small p2-muted">{t("plus2.gif.onlyYou")}</span>
      </div>
      <div className="p2-gif-previews">
        <div className="p2-gif-card">
          <div className="p2-gif-banner">{kind === "banner" ? media : null}</div>
          <div className="p2-gif-avatar">{kind === "avatar" ? media : <PAvatar user={user} size={56} />}</div>
          <div style={{ padding: "6px 12px 12px" }}>
            <b style={{ fontSize: 14 }}>{name}</b>
            <div className="p2-sub">{t("plus2.gif.cardSub")}</div>
          </div>
        </div>
        <div className="p2-gif-rows">
          <div className="p2-gif-row">
            <span style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", flex: "none", position: "relative" }}>{kind === "avatar" ? media : <PAvatar user={user} size={30} />}</span>
            <span className="p2-grow"><b>{name}</b><div className="p2-muted">{t("plus2.gif.chatSample")}</div></span>
          </div>
          <div className="p2-gif-row">
            <span style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", flex: "none", position: "relative" }}>{kind === "avatar" ? media : <PAvatar user={user} size={30} />}</span>
            <span className="p2-grow"><b>{name}</b><div className="p2-muted">{t("plus2.gif.memberSample")}</div></span>
            <span className="p2-pill is-ok">{t("plus2.gif.online")}</span>
          </div>
          {kind === "banner" ? <div className="p2-small p2-muted">{t("plus2.gif.bannerNote")}</div> : null}
        </div>
      </div>

      <div className={`p2-gif-offer${compact ? " is-compact" : ""}`}>
        {!compact ? (
          <>
            <div className="p2-h" style={{ fontSize: 14 }}>{t(kind === "banner" ? "plus2.gif.titleBanner" : "plus2.gif.titleAvatar")}</div>
            <div className="p2-small" style={{ color: "var(--p2-t2)", margin: "4px 0 10px" }}>{t("plus2.gif.body")}</div>
          </>
        ) : <div className="p2-small" style={{ color: "var(--p2-t2)", marginBottom: 8 }}>{t("plus2.gif.compact")}</div>}
        <div className="p2-gif-actions">
          {trialOk ? (
            <button type="button" className="p2-btn is-cta" onClick={tryIt} disabled={busy}><Sparkles />{t("plus2.gif.try", { days: offer?.trial?.days || 3 })}</button>
          ) : (
            <button type="button" className="p2-btn is-cta" onClick={tryIt} disabled={busy}><Sparkles />{t("plus2.cta.buyPlus")}</button>
          )}
          {offer?.features?.gifts && friends.length ? (
            asked ? <span className="p2-pill is-ok"><Check />{t("plus2.gif.asked")}</span>
              : <button type="button" className="p2-btn" onClick={() => setAskOpen((v) => !v)} disabled={busy} aria-expanded={askOpen}><Gift />{t("plus2.gif.ask")}</button>
          ) : null}
          <button type="button" className="p2-btn is-ghost" onClick={still} disabled={busy}>{busy ? <Loader2 className="p2-spin" /> : <ImageIcon />}{t("plus2.gif.still")}</button>
        </div>
        {askOpen ? (
          <div className="p2-row" style={{ marginTop: 10 }}>
            <select className="p2-select" value={askTo} onChange={(e) => setAskTo(e.target.value)} aria-label={t("plus2.gif.askWho")}>
              <option value="">{t("plus2.gif.askWho")}</option>
              {friends.map((f) => <option key={f.id} value={f.id}>{f.displayName || f.username}</option>)}
            </select>
            <button type="button" className="p2-btn is-sm is-cta" onClick={ask} disabled={!askTo || asking}>{asking ? <Loader2 className="p2-spin" /> : t("plus2.gif.askSend")}</button>
          </div>
        ) : null}
        {askOpen ? <div className="p2-small p2-muted" style={{ marginTop: 6 }}>{t("plus2.gif.askRule")}</div> : null}
        {err ? <div className="p2-err" style={{ marginTop: 8 }} role="alert">{t(err)}</div> : null}
      </div>
    </div>
  );
}
