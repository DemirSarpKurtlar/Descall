/**
 * Approximations of the system windows a passkey opens (Windows Hello / Windows Security,
 * the iOS passkey sheet, the Android Credential Manager sheet), for the control center's
 * live preview (draft A, "Kullanicinin gorecegi"). Drawn with plain markup so they scale
 * with `zoom`; they never pretend to be clickable. Styles: styles/passkey-center.css (.pko-*).
 */
import { useMemo } from "react";
import { KeyRound, ScanFace, Fingerprint, Usb, Lock, X } from "../ui/Icon.jsx";
import { useT } from "../../context/LocaleContext";

/** Deterministic QR-like pattern (not a real code: the real one comes from the OS). */
export function FakeQr({ size = 96 }) {
  const cells = useMemo(() => {
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const out = [];
    for (let y = 0; y < 21; y += 1) {
      for (let x = 0; x < 21; x += 1) {
        if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) continue;
        if (rnd() > 0.52) out.push([x, y]);
      }
    }
    return out;
  }, []);
  const c = size / 21;
  const finder = (x, y) => (
    <g key={`f${x}${y}`}>
      <rect x={x * c} y={y * c} width={7 * c} height={7 * c} fill="#111" />
      <rect x={(x + 1) * c} y={(y + 1) * c} width={5 * c} height={5 * c} fill="#fff" />
      <rect x={(x + 2) * c} y={(y + 2) * c} width={3 * c} height={3 * c} fill="#111" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x * c} y={y * c} width={c} height={c} fill="#111" />
      ))}
      {finder(0, 0)}
      {finder(14, 0)}
      {finder(0, 14)}
    </svg>
  );
}

/**
 * Windows Security / Windows Hello dialog.
 * mode: hello | qr | usb | gpm (Google Password Manager in Chrome) | web
 */
export function WinPrompt({ mode = "hello", app = true, provider = "" }) {
  const t = useT();
  const site = app ? "Descall" : "descall.com";
  const head = mode === "gpm" ? t("passkey.os.gpmHeader") : t("passkey.os.winHeader");
  const title =
    mode === "usb" ? t("passkey.os.usbTitle") : mode === "qr" ? t("passkey.os.qrTitle") : mode === "gpm" ? t("passkey.os.gpmTitle") : t("passkey.os.winTitle");
  const text =
    mode === "usb"
      ? t("passkey.os.usbText")
      : mode === "qr"
        ? t("passkey.os.qrText")
        : mode === "gpm"
          ? t("passkey.os.gpmText")
          : mode === "web"
            ? t("passkey.os.webText", { provider: provider || "Passkey" })
            : t("passkey.os.winText", { site });
  const Glyph = mode === "usb" ? Usb : mode === "gpm" ? Lock : mode === "web" ? KeyRound : ScanFace;
  return (
    <div className="pko-win" aria-hidden="true">
      <div className="hd">
        <span>{head}</span>
        <X size={12} />
      </div>
      <div className="bd">
        <h5>{title}</h5>
        <p>{text}</p>
        {mode === "qr" ? (
          <div className="qr">
            <FakeQr size={96} />
          </div>
        ) : (
          <>
            <div className="glyph">
              <Glyph size={30} />
            </div>
            <div className="sub">{mode === "usb" ? t("passkey.os.usbWait") : t("passkey.os.winRecognizing")}</div>
          </>
        )}
        <div className="lnk">{t("passkey.os.winMore")}</div>
      </div>
      <div className="ft">
        <span className="wbtn">{t("passkey.os.cancel")}</span>
      </div>
    </div>
  );
}

/** iOS passkey sheet (iCloud Keychain) or the NFC security-key sheet. */
export function IosSheet({ nfc = false, account = "" }) {
  const t = useT();
  return (
    <div className="pko-ios" aria-hidden="true">
      <span className="x">
        <X size={12} />
      </span>
      <KeyRound size={26} />
      <h5>{nfc ? t("passkey.os.nfcTitle") : t("passkey.os.iosTitle")}</h5>
      <p>{nfc ? t("passkey.os.nfcText") : t("passkey.os.iosText")}</p>
      <div className="acct">
        <KeyRound size={18} />
        <div>
          <b>{nfc ? "Security Key" : account || "descall"}</b>
          <span>{nfc ? t("passkey.os.nfcSub") : t("passkey.os.iosSub")}</span>
        </div>
      </div>
      <div className="blue">{nfc ? t("passkey.os.nfcWait") : t("passkey.os.continue")}</div>
      {nfc ? null : (
        <div className="faceid">
          <ScanFace size={46} />
        </div>
      )}
    </div>
  );
}

/** Android Credential Manager sheet (Google Password Manager). */
export function AndroidSheet({ account = "" }) {
  const t = useT();
  const initials = String(account || "D").slice(0, 2).toUpperCase();
  return (
    <div className="pko-and" aria-hidden="true">
      <div className="grab" />
      <div className="key">
        <KeyRound size={22} />
      </div>
      <h5>{t("passkey.os.gpmTitle")}</h5>
      <p>{t("passkey.os.andText")}</p>
      <div className="acct">
        <span className="av">{initials}</span>
        <div>
          <b>{account || "descall"}</b>
          <span>{t("passkey.os.andSub")}</span>
        </div>
      </div>
      <div className="gbtn">{t("passkey.os.continue")}</div>
      <div className="fp">
        <Fingerprint size={26} />
      </div>
      <div className="touch">{t("passkey.os.andTouch")}</div>
    </div>
  );
}

/** Small phone frame (status bar, island / punch hole, home bar). */
export function PhoneFrame({ os = "ios", children, className = "" }) {
  return (
    <div className={`pko-phone ${className}`.trim()} data-os={os} aria-hidden="true">
      <div className="scr">
        {os === "ios" ? <div className="island" /> : <div className="punch" />}
        <div className={`sbar${os === "ios" ? "" : " and"}`}>
          <span>{os === "ios" ? "9:41" : "09:41"}</span>
          <span className="sicons">
            <i />
            <i />
            <i />
          </span>
        </div>
        {children}
        <div className="homebar" />
      </div>
    </div>
  );
}

/** Descall sign-in header (logo + name), blurred behind the system windows. */
export function AuthBackdrop({ blur = 3 }) {
  return (
    <div className="pko-backdrop" style={{ filter: `blur(${blur}px)` }} aria-hidden="true">
      <span className="logo" />
      <b>Descall</b>
      <span className="line" />
      <span className="field" />
      <span className="field" />
      <span className="btn" />
    </div>
  );
}

