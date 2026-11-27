/**
 * Ayarlar > Güvenlik: the row that opens the passkey control center, with the count, the
 * security score and open alerts. Hidden when the server has passkeys off.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight, KeyRound } from "../../ui/Icon.jsx";
import { useT } from "../../../context/LocaleContext";
import { loadCenter, normalizePasskeyError } from "../../../lib/passkeys/index.js";
import { ScoreRing } from "./bits.jsx";
import "../../../styles/passkey-center.css";

export default function PasskeyEntry({ onOpen }) {
  const t = useT();
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadCenter()
        .then((r) => alive && setData(r))
        .catch((err) => {
          const e = normalizePasskeyError(err);
          if (alive && (e.serverCode === "PASSKEYS_UNAVAILABLE" || e.serverCode === "PASSKEYS_DISABLED")) setHidden(true);
        });
    load();
    window.addEventListener("descall:passkeys-changed", load);
    return () => {
      alive = false;
      window.removeEventListener("descall:passkeys-changed", load);
    };
  }, []);

  if (hidden) return null;
  const count = data?.passkeys?.length || 0;
  const score = data?.summary?.score;
  const alerts = data?.alerts?.length || 0;
  return (
    <section className="us-section" id="settings-passkeys">
      <h4 className="us-section-label">{t("passkey.settings.title")}</h4>
      <button type="button" className="pkc-entry us-card" onClick={onOpen} data-testid="passkey-entry">
        <span className="pkc-tile t-brand" style={{ width: 38, height: 38, borderRadius: 11 }} aria-hidden="true">
          <KeyRound size={20} />
        </span>
        <span className="grow min0">
          <b>{t("passkey.center.entry.title")}</b>
          <span className="pkc-small muted">
            {data ? (count ? t("passkey.center.entry.desc", { count, score: score?.value ?? 0 }) : t("passkey.center.entry.none")) : t("passkey.center.lead")}
          </span>
        </span>
        {alerts ? (
          <em className="pkc-pill err">
            <AlertTriangle size={11} /> {t("passkey.center.entry.alerts", { count: alerts })}
          </em>
        ) : null}
        {score ? <ScoreRing value={score.value} level={score.level} size={34} /> : null}
        <ChevronRight size={16} className="muted" />
      </button>
    </section>
  );
}
