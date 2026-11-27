/**
 * "Girişte göreceğin" (draft A): the system window this passkey opens on a Windows computer
 * and on a phone, live with the selected passkey; below it the sign-in states with the
 * platform switcher (Windows / iPhone / Android).
 */
import { useEffect, useRef, useState } from "react";
import { AndroidLogo, Monitor, Smartphone, WindowsLogo } from "../../ui/Icon.jsx";
import { useT } from "../../../context/LocaleContext";
import { passkeyKind, previewFor, idleDays } from "../../../lib/passkeys/visual.js";
import { WinPrompt, IosSheet, AndroidSheet, PhoneFrame, AuthBackdrop } from "../PasskeyOsPrompt.jsx";
import PasskeyStateCard, { PASSKEY_STATES } from "../PasskeyStateCard.jsx";

/** The 560 x 330 desktop scene, scaled to the width it gets. */
function MiniDesk({ children }) {
  const ref = useRef(null);
  const [scale, setScale] = useState(0.475);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = (w) => w > 0 && setScale(w / 560);
    set(el.getBoundingClientRect().width);
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(([e]) => set(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className="pkc-mini-desk" aria-hidden="true">
      <div className="pkc-mini-scene" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

const STATE_PILL = { wait: "brand", ok: "ok", cancel: "", err: "err", none: "warn" };

export function StatesPreview({ name = "" }) {
  const t = useT();
  const [plat, setPlat] = useState("windows");
  const [state, setState] = useState("wait");
  return (
    <div className="pkc-states">
      <div className="pkc-states-head">
        <b>{t("passkey.preview.states")}</b>
        <div className="pkc-platseg" role="radiogroup" aria-label={t("passkey.preview.platform")}>
          {[
            ["windows", WindowsLogo],
            ["ios", Smartphone],
            ["android", AndroidLogo],
          ].map(([p, G]) => (
            <button key={p} type="button" role="radio" aria-checked={plat === p} className={plat === p ? "on" : ""} onClick={() => setPlat(p)}>
              <G size={13} weight={p === "ios" ? "regular" : "fill"} /> {t(`passkey.preview.plat.${p}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="pkc-state-chips" role="tablist" aria-label={t("passkey.preview.states")}>
        {PASSKEY_STATES.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={state === s} className={`pkc-pill ${STATE_PILL[s]}${state === s ? " on" : ""}`.trim()} onClick={() => setState(s)}>
            {t(`passkey.state.label.${s}`)}
          </button>
        ))}
      </div>
      <div className="pkc-state-stage">
        <PasskeyStateCard state={state} platform={plat} name={name} detail={state === "err" ? t("passkey.err.timeout") : ""} preview className="glass" />
        <p className="pkc-state-foot">{t(`passkey.state.foot.${plat}.${state}`)}</p>
      </div>
    </div>
  );
}

export default function CenterPreview({ passkey, account = "", compact = false }) {
  const t = useT();
  if (!passkey) return null;
  const kind = passkeyKind(passkey);
  const pv = previewFor(kind);
  const idle = idleDays(passkey);
  const os = pv.phone === "android" ? "android" : "ios";
  let phoneBody;
  if (pv.phone === "none") {
    phoneBody = (
      <div className="pkc-prev-none">
        <PasskeyStateCard state="none" platform="ios" compact preview className="heavy" />
      </div>
    );
  } else if (pv.phone === "android") {
    phoneBody = (
      <>
        <div className="pkc-prev-blur">
          <AuthBackdrop blur={2} />
        </div>
        <AndroidSheet account={account} />
      </>
    );
  } else {
    phoneBody = (
      <>
        <div className="pkc-prev-blur">
          <AuthBackdrop blur={2} />
        </div>
        <IosSheet nfc={pv.phone === "nfc"} account={account} />
      </>
    );
  }
  const text = [t(`passkey.preview.text.${kind}`, { provider: passkey.provider || "Passkey" }), kind === "android" || idle >= 30 ? t("passkey.preview.idle", { count: idle }) : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={`pkc-prev heavy${compact ? " compact" : ""}`} aria-label={t("passkey.preview.title")}>
      <div className="ttl">
        <b>{t("passkey.preview.title")}</b>
        <span className="pkc-live">{t("passkey.preview.live")}</span>
      </div>
      <p className="sel">{t("passkey.preview.selected", { name: passkey.name })}</p>
      <div className="cap">
        <Monitor size={13} /> {t("passkey.preview.desktop")}
      </div>
      <MiniDesk>
        <div className="pkc-prev-blur">
          <AuthBackdrop blur={3} />
        </div>
        <div className="pkc-mini-center">
          <WinPrompt mode={pv.desktop} provider={passkey.provider} />
        </div>
      </MiniDesk>
      <div className="cap" style={{ marginTop: 12 }}>
        <Smartphone size={13} /> {t("passkey.preview.phone")}
      </div>
      <div className="pkc-prev-phone-row">
        <div className="pkc-mini-phone">
          <PhoneFrame os={os}>{phoneBody}</PhoneFrame>
        </div>
        <p className="txt">{text}</p>
      </div>
      {compact ? null : <StatesPreview name={account} />}
    </section>
  );
}
