import { useState } from "react";
import { useT } from "../../context/LocaleContext";
import { useFeatureSettings } from "../featureSettings.js";
import { DEFAULTS, PanelShell, Switch } from "../gaming/ui.jsx";
import { useLocalStore } from "../gaming/bridge.js";
import { clearClipboardHistory, removeClipboardItem, MAX_ITEMS } from "../gaming/clipboardHistory.js";
import { copyText } from "../../lib/copyText.js";
import { Copy, Trash2 } from "../../components/ui/Icon.jsx";

export const key = "clipboard_history";
const EMPTY = [];

export function Panel() {
  const t = useT();
  const [s, update] = useFeatureSettings(key, DEFAULTS.clipboard_history);
  const [items] = useLocalStore("clipboard", EMPTY);
  const [copied, setCopied] = useState(0);
  return (
    <PanelShell title={t("premiumGaming.clipboard.title")} desc={t("premiumGaming.clipboard.desc")} testId="pg-panel-clipboard_history">
      <Switch checked={s.on} onChange={(on) => update({ on })} label={t("premiumGaming.clipboard.enable")} />
      <p className="pg-help">{t("premiumGaming.clipboard.help")}</p>
      <div className="pg-row">
        <span className="pg-muted pg-grow">{t("premiumGaming.clipboard.count", { count: items.length, max: MAX_ITEMS })}</span>
        <button type="button" className="pg-btn is-small is-danger" onClick={clearClipboardHistory} disabled={!items.length}>{t("premiumGaming.clipboard.clear")}</button>
      </div>
      {items.length ? (
        <ul className="pg-list">
          {items.map((it) => (
            <li key={it.at}>
              <span className="pg-chip">{it.source === "paste" ? t("premiumGaming.clipboard.pasted") : t("premiumGaming.clipboard.copied")}</span>
              <span className="pg-grow" title={it.text}>{it.text}</span>
              <button type="button" className="pg-btn is-small" aria-label={t("premiumGaming.clipboard.copy")} onClick={async () => { await copyText(it.text); setCopied(it.at); }}>
                <Copy size={14} />{copied === it.at ? t("premiumGaming.clipboard.done") : null}
              </button>
              <button type="button" className="pg-btn is-small" aria-label={t("premiumGaming.common.remove")} onClick={() => removeClipboardItem(it.at)}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="pg-muted">{t("premiumGaming.clipboard.empty")}</p>}
    </PanelShell>
  );
}

export default Panel;
