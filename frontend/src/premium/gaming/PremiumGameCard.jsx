/* Descall+ game status card on the profile hover card: shown only when the member has
   game_status and their visibility setting lets this viewer see it (checked on the server). */
import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { fetchGameStatus } from "./gameData.js";
import { formatDuration } from "./ui.jsx";
import { Gamepad2 } from "../../components/ui/Icon.jsx";
import { isNativeMobileApp } from "../../lib/userVoicePanelEnv";

export default function PremiumGameCard({ userId }) {
  const t = useT();
  const [status, setStatus] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    let live = true;
    setStatus(null);
    if (isNativeMobileApp()) return undefined; // iOS / Android: status and badge only (CONTRACT)
    fetchGameStatus(userId).then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, [userId]);
  useEffect(() => {
    if (!status) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);
  if (!status?.game) return null;
  const since = Date.parse(status.started_at);
  return (
    <div className="uhc3-sec pg-gamecard" data-testid="hover-premium-game">
      <div className="uhc3-label">{t("premiumGaming.gameStatus.cardLabel")}</div>
      <div className="uhc3-act">
        <span className="uhc3-act-ic is-game"><Gamepad2 size={16} /></span>
        <span className="uhc3-act-text">
          <b>{status.game}</b>
          <span>{Number.isFinite(since) ? t("premiumGaming.gameStatus.forDuration", { duration: formatDuration(t, (Date.now() - since) / 1000) }) : ""}</span>
        </span>
      </div>
    </div>
  );
}
