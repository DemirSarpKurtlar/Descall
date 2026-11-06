import { useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS, deferredCount, gameState } from "../notify/premiumNotify.js";
import { DesktopOnly, Note, Row, Section, Toggle } from "../ui/PremiumAudioKit.jsx";

export const key = "smart_game_notifications";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, NOTIFY_DEFAULTS.smart_game_notifications);
  const [game, setGame] = useState(() => gameState());
  useEffect(() => {
    const on = () => setTimeout(() => setGame(gameState()), 0);
    window.addEventListener("descall:activity", on);
    return () => window.removeEventListener("descall:activity", on);
  }, []);
  return (
    <div className="pa-panel">
      <DesktopOnly>
        <Section title={t("premiumAudio.smartGame.title")} hint={t("premiumAudio.smartGame.hint")}>
          <Row title={t("premiumAudio.smartGame.summary")} description={t("premiumAudio.smartGame.summaryDesc")}>
            <Toggle value={s.summary !== false} onChange={(v) => update({ summary: v })} label={t("premiumAudio.smartGame.summary")} />
          </Row>
          <Row
            title={t("premiumAudio.smartGame.state")}
            description={game.active ? t("premiumAudio.smartGame.playing", { game: game.name || "-", count: deferredCount() }) : t("premiumAudio.smartGame.notPlaying")}
          />
        </Section>
        <Note>{t("premiumAudio.smartGame.detectNote")}</Note>
      </DesktopOnly>
    </div>
  );
}

export default Panel;
