/**
 * One card language for every passkey sign-in state (draft A, section 4 "Durumlar"):
 *   wait    the system window is open (Windows Hello, Face ID, fingerprint, the browser)
 *   handoff the desktop app sent the ceremony to the browser (Electron, old Windows)
 *   ok      signed in; a short "opening your servers" bar before the app shows
 *   cancel  the person closed the system window
 *   err     the server refused or the request timed out
 *   none    this device has no Descall passkey: a phone over QR, a security key, the password
 * The words and the glyph follow the platform (windows | ios | android | web). Used by the
 * sign-in button (live) and by the control center's state preview (static, `preview`).
 */
import { AlertTriangle, Check, ChevronRight, Fingerprint, KeyRound, Lock, QrCode, ScanFace, Usb, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";

export const PASSKEY_STATES = Object.freeze(["wait", "ok", "cancel", "err", "none"]);
const PLATFORMS = new Set(["windows", "ios", "android", "web"]);

export function stateMethodName(t, platform) {
  return t(`passkey.state.method.${PLATFORMS.has(platform) ? platform : "web"}`);
}

function KeyOff({ size = 28 }) {
  return (
    <span className="pkst-keyoff" style={{ width: size, height: size }}>
      <KeyRound size={size} />
      <i aria-hidden="true" />
    </span>
  );
}

export default function PasskeyStateCard({
  state,
  platform = "web",
  name = "",
  detail = "",
  handoff = null,
  compact = false,
  preview = false,
  progress = 68,
  onCancel,
  onRetry,
  onPassword,
  onPhone,
  onKey,
  onReopen,
  className = "",
}) {
  const t = useT();
  const plat = PLATFORMS.has(platform) ? platform : "web";
  const Btn = ({ kind = "", onClick, children }) =>
    preview ? (
      <span className={`pkc-btn sm ${kind}`.trim()} aria-hidden="true">
        {children}
      </span>
    ) : (
      <button type="button" className={`pkc-btn sm ${kind}`.trim()} onClick={onClick}>
        {children}
      </button>
    );
  const Opt = ({ icon, title, sub, onClick }) => {
    const inner = (
      <>
        {icon}
        <span className="txt">
          {title}
          <span>{sub}</span>
        </span>
        <ChevronRight size={14} className="chev" />
      </>
    );
    return preview ? (
      <span className="pkc-opt" aria-hidden="true">
        {inner}
      </span>
    ) : (
      <button type="button" className="pkc-opt" onClick={onClick}>
        {inner}
      </button>
    );
  };

  let body = null;
  if (state === "wait" || state === "handoff") {
    const Glyph = plat === "ios" ? ScanFace : plat === "web" ? KeyRound : Fingerprint;
    body = (
      <>
        <div className="pkst-ring">
          <svg className="r" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            <circle cx="36" cy="36" r="33" fill="none" className="track" strokeWidth="3" />
            <path d="M36 3a33 33 0 0 1 33 33" fill="none" className="arc" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="pkst-ic b">
            <Glyph size={28} />
          </span>
        </div>
        {state === "handoff" && handoff ? (
          <>
            <h6>{t("passkey.signIn.handoffTitle")}</h6>
            <p>{t("passkey.signIn.handoffLead", { code: handoff.matchCode })}</p>
            <div className="pkst-code tnum" aria-hidden="true">
              {String(handoff.matchCode || "").split("").map((c, i) => (
                <b key={i}>{c}</b>
              ))}
            </div>
            <div className="pkst-row">
              <Btn kind="ghost" onClick={onCancel}>
                {t("passkey.signIn.cancel")}
              </Btn>
              <Btn onClick={onReopen}>{t("passkey.signIn.handoffReopen")}</Btn>
            </div>
          </>
        ) : (
          <>
            <h6>{t(`passkey.state.waitTitle.${plat}`)}</h6>
            <p>{t(`passkey.state.waitLead.${plat}`)}</p>
            <Btn kind="ghost" onClick={onCancel}>
              {t("passkey.signIn.cancel")}
            </Btn>
          </>
        )}
      </>
    );
  } else if (state === "ok") {
    body = (
      <>
        <span className="pkst-ic g">
          <Check size={30} weight="bold" />
        </span>
        <h6>{name ? t("passkey.state.okTitle", { name }) : t("passkey.state.okTitleNoName")}</h6>
        <p>{t("passkey.state.okLead", { method: stateMethodName(t, plat) })}</p>
        <div className="pkst-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <p className="pkst-small">{t("passkey.state.okProgress")}</p>
      </>
    );
  } else if (state === "cancel") {
    body = (
      <>
        <span className="pkst-ic n">
          <X size={28} />
        </span>
        <h6>{t("passkey.state.cancelTitle")}</h6>
        <p>{t("passkey.state.cancelLead")}</p>
        <div className="pkst-row">
          <Btn kind="pri" onClick={onRetry}>
            {t("passkey.state.retry")}
          </Btn>
          <Btn onClick={onPassword}>{t("passkey.state.password")}</Btn>
        </div>
      </>
    );
  } else if (state === "err") {
    body = (
      <>
        <span className="pkst-ic r">
          <AlertTriangle size={28} />
        </span>
        <h6>{t("passkey.state.errTitle")}</h6>
        <p>{t("passkey.state.errLead")}</p>
        <div className="pkst-row">
          <Btn kind="pri" onClick={onRetry}>
            {t("passkey.state.retry")}
          </Btn>
          <Btn onClick={onPassword}>{t("passkey.state.password")}</Btn>
        </div>
        {detail ? <p className="pkst-small">{t("passkey.state.errDetail", { detail })}</p> : null}
      </>
    );
  } else if (state === "none") {
    body = (
      <>
        <span className="pkst-ic y">
          <KeyOff size={28} />
        </span>
        <h6>{t("passkey.state.noneTitle")}</h6>
        <p>{t("passkey.state.noneLead")}</p>
        <div className="pkst-opts">
          <Opt icon={<QrCode size={18} />} title={t("passkey.state.optPhone")} sub={t("passkey.state.optPhoneSub")} onClick={onPhone} />
          {compact ? null : <Opt icon={<Usb size={18} />} title={t("passkey.state.optKey")} sub={t("passkey.state.optKeySub")} onClick={onKey} />}
          <Opt icon={<Lock size={18} />} title={t("passkey.state.optPassword")} sub={t("passkey.state.optPasswordSub")} onClick={onPassword} />
        </div>
      </>
    );
  }
  if (!body) return null;
  return (
    <div
      className={`pkst-card${compact ? " compact" : ""} ${className}`.trim()}
      data-state={state}
      data-platform={plat}
      role={preview ? undefined : state === "err" ? "alert" : "status"}
      aria-live={preview ? undefined : "polite"}
    >
      {body}
    </div>
  );
}
