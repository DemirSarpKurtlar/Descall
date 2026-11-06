/** Descall+ call window (picture-in-picture). */
import { useT } from "../../context/LocaleContext";
import { requestAux } from "../desktop/desktopBus.js";
import { Actions, Btn, Group, Note } from "../story/kit.jsx";

export const key = "pip_call";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  return (
    <Group title={t("premium.win.call")}>
      <Note>{t("premiumStory.n.pip")}</Note>
      <Actions>
        <Btn kind="primary" icon="play" ds={ds("open")} data-testid="premium-open-call" onClick={() => requestAux("call", true)}>{t("premium.panel.openCall")}</Btn>
      </Actions>
    </Group>
  );
}
