import { useEffect, useState } from "react";
import { useFeatureSettings } from "../featureSettings.js";
import { useT } from "../../context/localeContextInstance";
import { NOTIFY_DEFAULTS, deferredCount, gameState } from "../notify/premiumNotify.js";
import { isDesktopApp } from "../ui/PremiumAudioKit.jsx";
import { DesktopOnlyHint, Group, Hint, Note, SetRow, Switch } from "../story/kit.jsx";

export const key = "smart_game_notifications";
// Settings > Descall+ shows the on/off switch; the Electron module uses the same default.
export const defaultEnabled = true;
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, NOTIFY_DEFAULTS.smart_game_notifications);
  const [game, setGame] = useState(() => gameState());
  useEffect(() => {
    const on = () => setTimeout(() => setGame(gameState()), 0);
    window.addEventListener("descall:activity", on);
    return () => window.removeEventListener("descall:activity", on);
  }, []);
  if (!isDesktopApp()) return <DesktopOnlyHint t={t} />;
  return (
    <>
      <Group title={t("premiumAudio.smartGame.title")}>
        <Note ds={ds("hint")}>{t("premiumAudio.smartGame.hint")}</Note>
        <SetRow icon="list" label={t("premiumAudio.smartGame.summary")} desc={t("premiumAudio.smartGame.summaryDesc")}>
          <Switch checked={s.summary !== false} onChange={(v) => update({ summary: v })} label={t("premiumAudio.smartGame.summary")} ds={ds("summary")} />
        </SetRow>
        <SetRow
          icon="gamepad"
          label={t("premiumAudio.smartGame.state")}
          desc={game.active ? t("premiumAudio.smartGame.playing", { game: game.name || "-", count: deferredCount() }) : t("premiumAudio.smartGame.notPlaying")}
          ds={ds("state")}
        />
      </Group>
      <Hint ds={ds("detectNote")}>{t("premiumAudio.smartGame.detectNote")}</Hint>
    </>
  );
}

export default Panel;
