/**
 * Draft A, section 3: after a password / Google / Apple sign-in, a polite card offers a
 * passkey for this device. Desktop and web: bottom right, the chat keeps working, after 20 s
 * it shrinks to a small button in the corner. Phones: a bottom sheet.
 * Only where passkeys work and this device has none (lib/passkeys hasLocalPasskey).
 * Rules (lib/passkeys/visual.js): "Sonra hatırlat" comes back 3 sign-ins later, at most 3
 * times; "Bu cihazda bir daha sorma" is per device (Settings > Passkeys turns it back on).
 * Adding needs no second prompt right after signing in (the server takes a sign-in younger
 * than 10 minutes as the proof); an older session is sent to Settings.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Fingerprint, ScanFace, WindowsLogo, KeyRound, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";
import { useToast } from "../../context/ToastContext";
import { isAvailable, register, prepareRegister, hasLocalPasskey, normalizePasskeyError, passkeyErrorKey, isSilentPasskeyError } from "../../lib/passkeys/index.js";
import { shouldSuggest, answerSuggestion, statePlatform, suggestionState } from "../../lib/passkeys/visual.js";
import PasskeyStateCard, { stateMethodName } from "./PasskeyStateCard.jsx";
import useModalFocus from "../../hooks/useModalFocus.js";
import "../../styles/passkey-center.css";

const COLLAPSE_MS = 20000;
const GLYPH = { windows: WindowsLogo, ios: ScanFace, android: Fingerprint, web: Fingerprint };

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isPhone() {
  try {
    return window.matchMedia?.("(max-width: 640px)")?.matches || Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export default function PasskeySuggestCard({ onOpenSettings }) {
  const t = useT();
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [avail, setAvail] = useState(null);
  const [card, setCard] = useState(null); // wait | handoff | done
  const [error, setError] = useState("");
  const [needsSettings, setNeedsSettings] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [method, setMethod] = useState("password");
  const ctlRef = useRef(null);
  const sheetRef = useRef(null);
  const phone = isPhone();
  useModalFocus(show && phone, sheetRef);

  const check = useCallback(async () => {
    const st = storage();
    if (!st || !suggestionState(st).pending) return;
    const a = avail || (await isAvailable().catch(() => ({ available: false })));
    setAvail(a);
    if (!shouldSuggest(st, { available: a.available, localPasskey: hasLocalPasskey() })) {
      answerSuggestion(st, "shown");
      return;
    }
    answerSuggestion(st, "shown");
    try {
      setMethod(sessionStorage.getItem("descall.pk.lastMethod") || "password");
    } catch {
      /* ignore */
    }
    setShow(true);
    if (a.path === "web") {
      prepareRegister(null)
        .then(setPrepared)
        .catch((err) => {
          if (normalizePasskeyError(err).serverCode === "REAUTH_REQUIRED") setNeedsSettings(true);
        });
    }
  }, [avail]);

  useEffect(() => {
    const timer = setTimeout(check, 1200);
    const onSuggest = () => setTimeout(check, 400);
    window.addEventListener("descall:passkey-suggest", onSuggest);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("descall:passkey-suggest", onSuggest);
      ctlRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!show || phone || card) return undefined;
    const timer = setTimeout(() => setCollapsed(true), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [show, phone, card, collapsed]);

  const finish = (answer) => {
    const st = storage();
    if (st && answer) answerSuggestion(st, answer);
    ctlRef.current?.abort();
    setShow(false);
  };

  const add = async () => {
    if (needsSettings) {
      finish(null);
      onOpenSettings?.();
      return;
    }
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setError("");
    setCard("wait");
    try {
      await register("", { prepared: prepared || undefined, signal: ctl.signal, onHandoff: () => setCard("handoff") });
      const st = storage();
      if (st) answerSuggestion(st, "added");
      setCard("done");
      toast(t("passkey.settings.added"), "success");
      window.dispatchEvent(new Event("descall:passkeys-changed"));
      setTimeout(() => setShow(false), 3500);
    } catch (err) {
      const e = normalizePasskeyError(err);
      setCard(null);
      setPrepared(null);
      if (e.serverCode === "REAUTH_REQUIRED") {
        setNeedsSettings(true);
        setError(t("passkey.suggest.needsReauth"));
        return;
      }
      if (!ctl.signal.aborted && !isSilentPasskeyError(e)) setError(t(passkeyErrorKey(e) || "passkey.err.server"));
      if (avail?.path === "web") prepareRegister(null).then(setPrepared, () => {});
    }
  };

  if (!show || !avail || typeof document === "undefined") return null;
  const plat = statePlatform(avail.path);
  const Glyph = GLYPH[plat] || KeyRound;
  const methodName = stateMethodName(t, plat);

  const checks = (
    <div className="pks-checks">
      <div className="pks-chk">
        <Check size={14} weight="bold" />
        {t("passkey.suggest.c1")}
      </div>
      <div className="pks-chk">
        <Check size={14} weight="bold" />
        {t("passkey.suggest.c2")}
      </div>
      <div className="pks-chk">
        <Check size={14} weight="bold" />
        {t(plat === "ios" ? "passkey.suggest.c3ios" : plat === "android" ? "passkey.suggest.c3android" : "passkey.suggest.c3")}
      </div>
    </div>
  );

  const busyCard =
    card === "wait" || card === "handoff" ? (
      <PasskeyStateCard state="wait" platform={plat} className="flat" onCancel={() => ctlRef.current?.abort()} />
    ) : card === "done" ? (
      <div className="pks-done" role="status">
        <span className="pkc-bigic g">
          <Check size={26} weight="bold" />
        </span>
        <b>{t("passkey.suggest.done", { method: methodName })}</b>
      </div>
    ) : null;

  if (phone) {
    return createPortal(
      <div className="pks-layer" onMouseDown={(e) => e.target === e.currentTarget && !card && finish("later")}>
        <div ref={sheetRef} className="pks-sheet heavy" role="dialog" aria-modal="true" aria-label={t(`passkey.suggest.title.${plat}`)}>
          <div className="grab" aria-hidden="true" />
          {busyCard || (
            <>
              <div className="pks-hero">
                <span className="pkc-bigic b">
                  <Glyph size={34} />
                </span>
              </div>
              <b className="pks-title center">{t(`passkey.suggest.phoneTitle.${plat}`)}</b>
              <p className="pks-lead center">{t("passkey.suggest.phoneLead")}</p>
              <div className="pks-checks">
                <div className="pks-chk">
                  <Check size={14} weight="bold" />
                  {t(plat === "ios" ? "passkey.suggest.c3ios" : plat === "android" ? "passkey.suggest.c3android" : "passkey.suggest.c1")}
                </div>
                <div className="pks-chk">
                  <Check size={14} weight="bold" />
                  {t("passkey.suggest.c2short")}
                </div>
              </div>
              {error ? (
                <p className="pkc-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="button" className="pkc-btn pri wide" onClick={add}>
                {needsSettings ? t("passkey.suggest.openSettings") : t("passkey.settings.add")}
              </button>
              <button type="button" className="pkc-btn ghost wide" onClick={() => finish("later")}>
                {t("passkey.suggest.notNow")}
              </button>
            </>
          )}
        </div>
      </div>,
      document.body
    );
  }

  if (collapsed && !card) {
    return createPortal(
      <button type="button" className="pks-mini heavy" onClick={() => setCollapsed(false)} aria-label={t("passkey.suggest.expand")}>
        <Glyph size={18} />
        <span>{t("passkey.suggest.mini")}</span>
      </button>,
      document.body
    );
  }

  return createPortal(
    <>
      <div className="pks-signed glass" role="status">
        <span className="pkc-bigic g" style={{ width: 22, height: 22 }}>
          <Check size={13} weight="bold" />
        </span>
        {t(`passkey.suggest.signedIn.${method}`)}
      </div>
      <div className="pks-card heavy" role="dialog" aria-label={t(`passkey.suggest.title.${plat}`)} onMouseEnter={() => setCollapsed(false)}>
        {busyCard || (
          <>
            <div className="pks-top">
              <span className="pkc-tile t-brand" style={{ width: 42, height: 42, borderRadius: 13 }} aria-hidden="true">
                <Glyph size={22} />
              </span>
              <div className="grow">
                <b className="pks-title">{t(`passkey.suggest.title.${plat}`)}</b>
                <div className="pkc-small muted">{t("passkey.suggest.lead")}</div>
              </div>
              <button type="button" className="pkc-icon-btn" onClick={() => finish("later")} aria-label={t("passkey.suggest.later")}>
                <X size={16} />
              </button>
            </div>
            {checks}
            {error ? (
              <p className="pkc-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="pkc-row">
              <button type="button" className="pkc-btn pri grow2" onClick={add}>
                <Glyph size={16} /> {needsSettings ? t("passkey.suggest.openSettings") : t("passkey.settings.add")}
              </button>
              <button type="button" className="pkc-btn grow" onClick={() => finish("later")}>
                {t("passkey.suggest.later")}
              </button>
            </div>
            <button type="button" className="pks-never" onClick={() => finish("never")}>
              {t("passkey.suggest.never")}
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
