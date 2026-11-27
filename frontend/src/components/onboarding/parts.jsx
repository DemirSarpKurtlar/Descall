/** Small pieces shared by the "Başla panosu" screens (avatars, server icons, sparklines, toasts). */
import "../../styles/onboarding.css";
import { useId } from "react";
import { useT } from "../../context/LocaleContext";
import { avatarTone, initial, serverInitials, serverTone, sparkArea, sparkPath, splitRich, RICH } from "../../lib/onboarding";
import { Award, AlertCircle, Coins } from "../ui/Icon.jsx";

export function Avatar({ name, src, size = 32, online = false, speaking = false, toneKey }) {
  return (
    <span className={`onb-av ${src ? "" : avatarTone(toneKey || name)}${speaking ? " is-speaking" : ""}`} style={{ "--s": `${size}px` }} aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : initial(name)}
      {online ? <i /> : null}
    </span>
  );
}

export function ServerIcon({ server, size = 36, official = false }) {
  const name = server?.name || "";
  if (official) {
    return (
      <span className="onb-si is-official" style={{ "--s": `${size}px` }} aria-hidden="true">
        <img src={server?.iconUrl || "/brand/descall-icon-small.svg"} alt="" />
      </span>
    );
  }
  return (
    <span className={`onb-si ${server?.iconUrl ? "" : serverTone(server?.id || name)}`} style={{ "--s": `${size}px` }} aria-hidden="true">
      {server?.iconUrl ? <img src={server.iconUrl} alt="" loading="lazy" decoding="async" /> : serverInitials(name)}
    </span>
  );
}

export function Spark({ values, color = "#8FA6FF", w = 120, h = 24, label }) {
  const gid = useId().replace(/:/g, "");
  const d = sparkPath(values, w, h);
  if (!d) return <svg className="onb-spark" viewBox={`0 0 ${w} ${h}`} aria-hidden="true" />;
  return (
    <svg className="onb-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : "true"}>
      <defs>
        <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={sparkArea(values, w, h)} fill={`url(#g${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Coin({ size = 16 }) {
  return <span className="onb-coin" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** "Descall'da şu an {count} çevrimiçi" with the count in bold. */
export function Rich({ text, bold, className }) {
  const [a, b] = splitRich(text);
  return (
    <span className={className}>
      {a}
      <b className="tnum">{bold}</b>
      {b}
    </span>
  );
}
export { RICH };

export function Toasts({ toasts }) {
  const t = useT();
  if (!toasts?.length) return null;
  return (
    <div className="onb-toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`onb-toast${x.kind === "error" ? " is-error" : ""}`}>
          {x.kind === "badge" ? (
            <span className="onb-badge-ico"><Award size={17} /></span>
          ) : x.kind === "error" ? (
            <AlertCircle size={18} />
          ) : (
            <Coins size={18} style={{ color: "var(--onb-gold-t)" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {x.kind === "badge" ? (
              <>
                <b>{t("onb.toast.badgeTitle")}</b>
                <br />
                <span className="onb-muted">{t("onb.toast.badgeSub", { n: x.amount })}</span>
              </>
            ) : x.kind === "error" ? (
              <span>{x.text}</span>
            ) : x.capped ? (
              <span>{t("onb.toast.capped")}</span>
            ) : (
              <span>{t(`onb.toast.step.${x.step}`, { n: x.amount })}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
