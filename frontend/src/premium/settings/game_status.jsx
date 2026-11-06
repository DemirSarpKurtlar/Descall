import { useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { Field, PanelShell, Switch, formatDuration } from "../gaming/ui.jsx";
import { useAppBridge } from "../gaming/bridge.js";
import { fetchGamePrefs, saveGamePrefs } from "../gaming/gameData.js";
import { EXTRA_GAMES } from "../gaming/extraGames.js";
import { gameNameFromActivity } from "../../lib/gameActivity.js";

export const key = "game_status";
const VIS = ["everyone", "friends", "nobody"];

export function Panel() {
  const t = useT();
  const app = useAppBridge();
  const [vis, setVis] = useState("friends");
  const [state, setState] = useState("");
  useEffect(() => { fetchGamePrefs().then((p) => { if (p?.game_card) setVis(p.game_card); }); }, []);
  const change = async (v) => {
    setVis(v);
    setState("");
    try { await saveGamePrefs(v); setState("ok"); } catch { setState("err"); }
  };
  const activity = app.activity || null;
  const game = gameNameFromActivity(activity?.currentActivity);
  const since = activity?.currentActivity?.startedAt ? Date.parse(activity.currentActivity.startedAt) : 0;
  const sharing = activity?.settings ? activity.settings.show_game_activity !== false : true;
  return (
    <PanelShell title={t("premiumGaming.gameStatus.title")} desc={t("premiumGaming.gameStatus.desc")} testId="pg-panel-game_status">
      <div className="pg-card">
        <div className="pg-label">{t("premiumGaming.gameStatus.now")}</div>
        <div className="pg-row">
          <b className="pg-grow">{game || t("premiumGaming.gameStatus.noGame")}</b>
          {game && since ? <span className="pg-muted pg-num">{formatDuration(t, (Date.now() - since) / 1000)}</span> : null}
        </div>
      </div>
      <Field label={t("premiumGaming.gameStatus.visibility")}>
        <select className="pg-select" value={vis} onChange={(e) => change(e.target.value)} data-testid="pg-game-vis">
          {VIS.map((v) => <option key={v} value={v}>{t(`premiumGaming.gameStatus.vis.${v}`)}</option>)}
        </select>
      </Field>
      {state === "ok" ? <span className="pg-ok">{t("premiumGaming.common.saved")}</span> : null}
      {state === "err" ? <span className="pg-error">{t("premiumGaming.common.failed")}</span> : null}
      {activity?.updateSettings ? (
        <Switch checked={sharing} onChange={(on) => activity.updateSettings({ show_game_activity: on })} label={t("premiumGaming.gameStatus.share")} />
      ) : null}
      <p className="pg-help">{t("premiumGaming.gameStatus.help", { count: Object.keys(EXTRA_GAMES).length })}</p>
    </PanelShell>
  );
}

export default Panel;
