import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { formatDuration } from "../gaming/ui.jsx";
import { failMessage, reportFailure, useAppBridge } from "../gaming/bridge.js";
import { fetchGamePrefs, saveGamePrefs } from "../gaming/gameData.js";
import { EXTRA_GAMES } from "../gaming/extraGames.js";
import { gameNameFromActivity } from "../../lib/gameActivity.js";
import { Group, Hint, Note, Seg, SetRow, Switch } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "game_status";
const ds = (s) => `${key}.${s}`;
const VIS = [["everyone", "users"], ["friends", "user"], ["nobody", "lock"]];

export function Panel() {
  const t = useT();
  const app = useAppBridge();
  const [vis, setVis] = useState("friends");
  const [state, setState] = useState("");
  const [failure, setFailure] = useState(null);
  useEffect(() => { fetchGamePrefs().then((p) => { if (p?.game_card) setVis(p.game_card); }); }, []);
  usePublish("game_status.vis", vis);
  const change = async (v) => {
    setVis(v);
    setState("");
    try { await saveGamePrefs(v); setState("ok"); } catch (err) {
      const f = { status: err?.status, code: err?.code, error: err?.message };
      reportFailure("game_status", f);
      setFailure(f);
      setState("err");
    }
  };
  const activity = app.activity || null;
  const game = gameNameFromActivity(activity?.currentActivity);
  const since = activity?.currentActivity?.startedAt ? Date.parse(activity.currentActivity.startedAt) : 0;
  const sharing = activity?.settings ? activity.settings.show_game_activity !== false : true;
  return (
    <>
      <Group title={t("premiumGaming.gameStatus.now")}>
        <Note ds={ds("desc")}>{t("premiumGaming.gameStatus.desc")}</Note>
        <SetRow icon="gamepad" label={game || t("premiumGaming.gameStatus.noGame")} desc={game && since ? formatDuration(t, (Date.now() - since) / 1000) : undefined} ds={ds("now")} />
        {activity?.updateSettings ? (
          <SetRow icon="eye" label={t("premiumGaming.gameStatus.share")}>
            <Switch checked={sharing} onChange={(on) => activity.updateSettings({ show_game_activity: on })} label={t("premiumGaming.gameStatus.share")} ds={ds("share")} />
          </SetRow>
        ) : null}
      </Group>
      <Group title={t("premiumGaming.gameStatus.visibility")}>
        <Seg value={vis} onChange={change} label={t("premiumGaming.gameStatus.visibility")} ds={ds("visibility")} wrap options={VIS.map(([v, icon]) => ({ value: v, label: t(`premiumGaming.gameStatus.vis.${v}`), icon }))} />
        {state === "ok" ? <Hint tone="ok" live>{t("premiumGaming.common.saved")}</Hint> : null}
        {state === "err" ? <Hint tone="err" live>{failMessage(t, failure)}</Hint> : null}
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.gameStatus.help", { count: Object.keys(EXTRA_GAMES).length })}</Hint>
    </>
  );
}

export default Panel;
