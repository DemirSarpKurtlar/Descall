/**
 * "Kullanıcının göreceği ekran" in the admin ban dialog: a scaled-down,
 * non-interactive copy of the user's ban screen.
 *
 * The real screen is components/ban/BanScreen.jsx (props `{ state, preview: true }`),
 * loaded lazily; while it loads, or if it throws, a static card that mirrors the
 * approved draft is shown instead.
 */
import { Component, Suspense, lazy, useLayoutEffect, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatAppDateTime } from "../../lib/datetime";
import { Ban, MessageCircle, LogOut } from "../ui/Icon.jsx";
import { countdownParts } from "./banDialogModel.js";

// The real user-facing screen; the static card stays as the fallback if the chunk fails.
const RealBanScreen = lazy(() =>
  import("../ban/BanScreen.jsx")
    .then((m) => ({ default: m.default || FallbackBanCard }))
    .catch(() => ({ default: FallbackBanCard }))
);

/** Draft width of the ban card; the preview shows it at SCALE. */
const CARD_WIDTH = 520;
const SCALE = 0.6;

const DATE_OPTS = { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: undefined };

/** Static stand-in for BanScreen (draft 1-sureli / 2-kalici card). */
export function FallbackBanCard({ state, categoryLabel = "", durationLabel = "" }) {
  const { t, locale } = useLocale();
  const ban = state?.ban || {};
  const permanent = !ban.expiresAt;
  const seconds = permanent ? 0 : (Date.parse(ban.expiresAt) - Date.parse(ban.bannedAt)) / 1000;
  const cd = countdownParts(seconds);
  const when = (iso) => formatAppDateTime(iso, locale, DATE_OPTS) || "";
  const username = ban.username || "";
  return (
    <div className="bpv-card" aria-hidden="true">
      <div className="bpv-seal">
        <Ban size={30} />
      </div>
      <div className="bpv-kicker">{t("banAdmin.preview.kicker")}</div>
      <h2 className="bpv-title">
        {permanent ? t("banAdmin.preview.titlePermanent") : t("banAdmin.preview.titleTimed", { duration: durationLabel })}
      </h2>
      <p className="bpv-lead">
        {permanent ? t("banAdmin.preview.leadPermanent", { username }) : t("banAdmin.preview.leadTimed", { username })}
      </p>
      {!permanent ? (
        <div className="bpv-cd">
          <div>
            <b>{cd.days}</b>
            <span>{t("banAdmin.preview.days")}</span>
          </div>
          <div>
            <b>{cd.hours}</b>
            <span>{t("banAdmin.preview.hours")}</span>
          </div>
          <div>
            <b>{cd.minutes}</b>
            <span>{t("banAdmin.preview.minutes")}</span>
          </div>
        </div>
      ) : null}
      <div className="bpv-facts">
        <div className="bpv-fact">
          <span>{t("banAdmin.preview.reason")}</span>
          <b className="is-red">{categoryLabel || ban.reason}</b>
        </div>
        <div className="bpv-fact">
          <span>{t("banAdmin.preview.decidedAt")}</span>
          <b>{when(ban.bannedAt)}</b>
        </div>
        {permanent ? (
          <div className="bpv-fact">
            <span>{t("banAdmin.preview.length")}</span>
            <b className="is-red">{t("banAdmin.preview.permanent")}</b>
          </div>
        ) : (
          <div className="bpv-fact">
            <span>{t("banAdmin.preview.opensAt")}</span>
            <b>{when(ban.expiresAt)}</b>
          </div>
        )}
      </div>
      {ban.message ? (
        <div className="bpv-note">
          <small>{t("banAdmin.preview.note")}</small>
          <p>{ban.message}</p>
        </div>
      ) : null}
      <div className="bpv-acts">
        <span className="bpv-btn is-primary">
          <MessageCircle size={18} />
          {t("banAdmin.preview.appeal")}
        </span>
        <span className="bpv-btn">
          <LogOut size={18} />
          {t("banAdmin.preview.otherAccount")}
        </span>
      </div>
      <div className="bpv-links">
        <span>{t("banAdmin.preview.rules")}</span>
        <span>{t("banAdmin.preview.export")}</span>
        <span>{t("banAdmin.preview.delete")}</span>
      </div>
      {permanent ? <p className="bpv-fine">{t("banAdmin.preview.fine")}</p> : null}
    </div>
  );
}

/** Falls back to the static card when the real screen throws while rendering. */
class PreviewBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    /* the static card is shown instead; nothing to report */
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * @param {{ state: object, categoryLabel?: string, durationLabel?: string }} props
 *   state: { kind: "account", ban: {...}, live: false } (see banDialogModel.previewBanState)
 */
export default function BanPreview({ state, categoryLabel, durationLabel }) {
  const innerRef = useRef(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fallback = <FallbackBanCard state={state} categoryLabel={categoryLabel} durationLabel={durationLabel} />;

  return (
    <div className="bpv" style={{ height: height ? Math.ceil(height * SCALE) : undefined }}>
      <div ref={innerRef} className="bpv-inner" style={{ width: CARD_WIDTH, transform: `scale(${SCALE})` }} inert="">
        {RealBanScreen ? (
          <PreviewBoundary fallback={fallback}>
            <Suspense fallback={fallback}>
              <RealBanScreen state={state} preview />
            </Suspense>
          </PreviewBoundary>
        ) : (
          fallback
        )}
      </div>
    </div>
  );
}
