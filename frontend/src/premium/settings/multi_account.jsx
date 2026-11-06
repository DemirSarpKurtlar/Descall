import { useCallback, useEffect, useState } from "react";
import { useT } from "../../context/LocaleContext";
import { failMessage, isDesktop, pinvoke, reportFailure } from "../gaming/bridge.js";
import { Badge, Btn, Group, Hint, IconBtn, Item, List, Note } from "../story/kit.jsx";
import { usePublish } from "../story/bus.js";

export const key = "multi_account";
const ds = (s) => `${key}.${s}`;

export function Panel() {
  const t = useT();
  const [data, setData] = useState({ accounts: [], max: 3 });
  const [err, setErr] = useState("");
  const reload = useCallback(async () => {
    const r = await pinvoke("premium:multi_account:list");
    if (r?.ok) setData({ accounts: r.accounts || [], max: r.max || 3 });
  }, []);
  useEffect(() => { if (isDesktop()) reload(); }, [reload]);
  usePublish("multi_account.count", data.accounts.length);
  const add = async () => {
    const r = await pinvoke("premium:multi_account:add");
    if (!r?.ok && r?.error !== "limit") reportFailure("multi_account", r);
    setErr(r?.ok ? "" : r?.error === "limit" ? t("premiumGaming.multiAccount.limit", { max: data.max }) : failMessage(t, r));
    reload();
  };
  return (
    <>
      <Group title={t("premiumGaming.multiAccount.title")} aside={<span className="tnum">{`${data.accounts.length} / ${data.max}`}</span>}>
        <Note ds={ds("desc")}>{t("premiumGaming.multiAccount.desc")}</Note>
        {!isDesktop() ? <Hint>{t("premiumGaming.common.desktopOnly")}</Hint> : null}
        <List ds={ds("list")} empty={data.accounts.length ? null : t("premiumGaming.multiAccount.empty")}>
          {data.accounts.map((a) => (
            <Item key={a.id} icon="user" title={a.label || t("premiumGaming.multiAccount.unnamed")}>
              <Badge tone={a.signedIn ? "ok" : ""}>{a.signedIn ? t("premiumGaming.multiAccount.signedIn") : t("premiumGaming.multiAccount.notSignedIn")}</Badge>
              <Btn onClick={() => pinvoke("premium:multi_account:open", a.id)}>{t("premiumGaming.multiAccount.open")}</Btn>
              <IconBtn icon="trash" danger label={t("premiumGaming.common.remove")} onClick={async () => { await pinvoke("premium:multi_account:remove", a.id); reload(); }} />
            </Item>
          ))}
        </List>
        <div className="ps-act">
          <Btn kind="primary" icon="plus" ds={ds("add")} disabled={!isDesktop() || data.accounts.length >= data.max} onClick={add}>{t("premiumGaming.multiAccount.add")}</Btn>
        </div>
        {err ? <Hint tone="err" live>{err}</Hint> : null}
      </Group>
      <Hint ds={ds("help")}>{t("premiumGaming.multiAccount.help", { max: data.max })}</Hint>
    </>
  );
}

export default Panel;
