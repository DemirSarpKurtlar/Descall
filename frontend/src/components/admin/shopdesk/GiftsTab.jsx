/** "Hediyeler": gift history (seen / worn), undo with confirm, and multi-user gifting. */
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Eye, Gift, Undo2 } from "../../ui/Icon.jsx";
import { Ava, Empty, ItemThumb, Pill, Skel, errMsg } from "./ui.jsx";
import OpsStrip from "./OpsStrip.jsx";
import QuickPanel from "./QuickPanel.jsx";

export default function GiftsTab({ data, items, kpis, mismatchCount, goTab, focusQuick, afterWrite, showToast, openPerson }) {
  const { t, locale } = useLocale();
  const [gifts, setGifts] = useState(null);
  const [err, setErr] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => {
    try {
      const d = await adminFetch("/shop/gifts?limit=100");
      setGifts(d.gifts || []);
      setErr("");
    } catch (e) {
      setErr(errMsg(t, e, "shopDesk.loadError"));
    }
  }, [t]);
  useEffect(() => {
    load();
  }, [load]);

  const undo = async (g) => {
    if (confirm !== g.id) {
      setConfirm(g.id);
      return;
    }
    setBusy(g.id);
    try {
      const r = await adminFetch(`/shop/gifts/${g.id}`, { method: "DELETE", body: JSON.stringify({ reason: "undo_from_history" }) });
      setGifts((list) => (list || []).filter((x) => x.id !== g.id));
      afterWrite(r.unequipped ? t("shopDesk.giftUndoneWorn", { user: g.user?.username || "" }) : t("shopDesk.giftUndone"));
    } catch (e) {
      showToast(errMsg(t, e), null, "bad");
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  };

  return (
    <div className="sdk-ops">
      <OpsStrip kpis={kpis} mismatchCount={mismatchCount} reconcileAt={data?.reconcile?.started_at} onReconcile={() => goTab("reconcile")} />
      <div className="sdk-desk">
        <section className="sdk-card" aria-labelledby="sdk-gifts-h">
          <div className="sdk-card-head">
            <h2 id="sdk-gifts-h" className="sdk-card-title">
              <Gift size={20} />
              {t("shopDesk.giftHistory")}
            </h2>
            <span className="sdk-muted">{t("shopDesk.giftHistorySub")}</span>
          </div>
          {err ? <p className="sdk-err">{err}</p> : null}
          {!gifts && !err ? (
            <Skel h={300} />
          ) : gifts && !gifts.length ? (
            <Empty icon={Gift} title={t("shopDesk.noGifts")} />
          ) : gifts ? (
            <ul className="sdk-giftlist">
              {gifts.map((g) => (
                <li key={g.id}>
                  <ItemThumb item={g.item} size={46} />
                  <div className="sdk-gift-main">
                    <b>{g.item?.name || t("shopDesk.deletedItem")}</b>
                    <small>
                      {t("shopDesk.giftLine", {
                        user: g.user ? `@${g.user.username}` : t("shopDesk.deletedUser"),
                        by: g.by ? `@${g.by.username}` : "-",
                        when: new Date(g.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                      })}
                    </small>
                    {g.message ? <span className="sdk-quote">{g.message}</span> : null}
                  </div>
                  <span className="sdk-gift-pills">
                    {g.seen ? (
                      <Pill tone="blue">
                        <Eye size={12} />
                        {t("shopDesk.seen")}
                      </Pill>
                    ) : (
                      <Pill tone="gray">{t("shopDesk.notSeen")}</Pill>
                    )}
                    {g.equipped ? <Pill tone="green">{t("shopDesk.worn")}</Pill> : null}
                  </span>
                  {g.user ? <Ava user={g.user} size={30} /> : null}
                  <span className="sdk-rowacts">
                    {g.user ? (
                      <button type="button" className="sdk-link" onClick={() => openPerson(g.user.id)}>
                        {t("shopDesk.userFile")}
                      </button>
                    ) : null}
                    <button type="button" className={`sdk-btn is-sm${confirm === g.id ? " is-danger" : ""}`} disabled={busy === g.id} onClick={() => undo(g)} onBlur={() => setTimeout(() => setConfirm((c) => (c === g.id ? null : c)), 200)}>
                      <Undo2 size={15} />
                      {confirm === g.id ? (g.equipped ? t("shopDesk.undoConfirmWorn") : t("shopDesk.undoConfirm")) : t("shopDesk.undo")}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
        <aside className="sdk-rail">
          <QuickPanel
            items={items}
            initialMode="gift"
            title={t("shopDesk.giftCta")}
            focusSignal={focusQuick}
            onDone={async (msg, action) => {
              await afterWrite(msg, action);
              load();
            }}
            showToast={showToast}
          />
        </aside>
      </div>
    </div>
  );
}
