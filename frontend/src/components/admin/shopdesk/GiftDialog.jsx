/** "Hediye et": one item to one or more users, optional message, undo from the toast. */
import { useEffect, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Gift } from "../../ui/Icon.jsx";
import DossierDialog, { DialogActions, DialogError } from "../dossier/DossierDialog.jsx";
import { ItemPicker, UserPicker, errMsg } from "./ui.jsx";
import { undoGifts } from "./QuickPanel.jsx";

export default function GiftDialog({ open, preset, items, onClose, onDone }) {
  const { t } = useLocale();
  const [users, setUsers] = useState([]);
  const [itemId, setItemId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setUsers(preset?.users || []);
    setItemId(preset?.itemId || "");
    setMessage("");
    setErr("");
  }, [open, preset]);

  const item = items.find((it) => it.id === itemId);
  const submit = async () => {
    if (!users.length || !itemId || busy) return;
    setBusy(true);
    setErr("");
    try {
      const r = await adminFetch("/shop/gifts", { method: "POST", body: JSON.stringify({ itemId, userIds: users.map((u) => u.id), message: message.trim() || null }) });
      const msg = r.skipped?.length
        ? t("shopDesk.giftSentSkipped", { n: r.granted.length, item: item?.name || "", skipped: r.skipped.length })
        : t("shopDesk.giftSent", { n: r.granted.length, item: item?.name || "" });
      onDone?.(
        msg,
        r.granted.length
          ? {
              label: t("shopDesk.undo"),
              run: async () => {
                await undoGifts(r.granted);
                onDone?.(t("shopDesk.giftUndone"));
              },
            }
          : null
      );
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Gift} tone="violet" title={t("shopDesk.giftTitle")} subtitle={t("shopDesk.giftSub")} width={600} testId="sdk-gift-dialog">
      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.recipients")}</div>
        <UserPicker multi value={users} onChange={setUsers} placeholder={t("shopDesk.recipientsPh")} autoFocus />
      </div>
      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.item")}</div>
        <ItemPicker items={items} value={itemId} onChange={setItemId} />
      </div>
      <label className="dsr-field">
        <span className="dsr-lab">{t("shopDesk.giftMessage")}</span>
        <input className="sdk-input" value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder={t("shopDesk.giftMessagePh")} />
      </label>
      <p className="dsr-hint">{t("shopDesk.giftHint")}</p>
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("shopDesk.cancel")}
        busy={busy}
        disabled={!users.length || !itemId}
        onSubmit={submit}
        submitLabel={busy ? t("shopDesk.working") : users.length > 1 ? t("shopDesk.giftToN", { n: users.length }) : t("shopDesk.giftSend")}
        icon={Gift}
      />
    </DossierDialog>
  );
}
