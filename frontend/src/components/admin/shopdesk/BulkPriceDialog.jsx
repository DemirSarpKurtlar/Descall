/**
 * Draft A "Toplu fiyat değişikliği": fixed / percent / add-subtract / scheduled discount for
 * the selected items, with rounding, a before/after preview, the owners warning, a required
 * reason (audit) and the optional shop updates note.
 */
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import GlassCheckbox from "../../ui/GlassCheckbox";
import { AlertTriangle, Check, Coins } from "../../ui/Icon.jsx";
import DossierDialog, { DialogActions, DialogError } from "../dossier/DossierDialog.jsx";
import { TrendDownIcon, TrendUpIcon } from "./shopDeskIcons.js";
import { PRICE_MODES, ROUNDINGS, bulkPreview, fromLocalInput, num, parseSignedNumber, stockInfo } from "./shopDeskModel.js";
import { ItemThumb, Seg, errMsg } from "./ui.jsx";

export default function BulkPriceDialog({ open, mode: initialMode = "percent", items, onClose, onDone }) {
  const { t, locale } = useLocale();
  const [mode, setMode] = useState(initialMode);
  const [raw, setRaw] = useState("-%15");
  const [rounding, setRounding] = useState("50");
  const [pct, setPct] = useState("20");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [owners, setOwners] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(initialMode || "percent");
    setRaw(initialMode === "fixed" ? "" : "-%15");
    setReason("");
    setErr("");
    setOwners(null);
    const ids = items.map((it) => it.id).join(",");
    if (ids) adminFetch(`/shop/desk/owners-count?ids=${ids}`).then((d) => setOwners(d.owners)).catch(() => setOwners(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const value = parseSignedNumber(raw);
  const rows = useMemo(() => bulkPreview(items, mode, { value, rounding, pct: Number(pct) }), [items, mode, value, rounding, pct]);
  const limited = items.map((it) => ({ it, s: stockInfo(it) })).filter((x) => x.s);
  const ok =
    items.length > 0 &&
    reason.trim().length >= 3 &&
    (mode === "sale" ? Number(pct) >= 1 && Number(pct) <= 95 && (!startsAt || !endsAt || Date.parse(endsAt) > Date.parse(startsAt)) : value != null && rows.every((r) => r.next != null));

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    setErr("");
    try {
      const body =
        mode === "sale"
          ? { action: "sale", sale: { pct: Number(pct), startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt) } }
          : { action: "price", op: { type: mode, value, rounding } };
      const r = await adminFetch("/shop/desk/bulk", { method: "POST", body: JSON.stringify({ ...body, itemIds: items.map((it) => it.id), reason: reason.trim(), announce }) });
      onDone?.(t("shopDesk.toastBulk", { n: r.changed }));
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  const names = items.map((it) => it.name);
  const subtitle = names.length > 4 ? `${names.slice(0, 4).join(", ")} ${t("shopDesk.andMore", { n: names.length - 4 })}` : names.join(", ");
  const fieldLabel = mode === "fixed" ? t("shopDesk.newPrice") : mode === "delta" ? t("shopDesk.deltaAmount") : t("shopDesk.rate");
  const hint = mode === "percent" ? t("shopDesk.permanentHint") : mode === "delta" ? t("shopDesk.deltaHint") : t("shopDesk.fixedHint");

  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Coins} tone="blue" title={t("shopDesk.bulkTitle", { n: items.length })} subtitle={subtitle} width={860} testId="sdk-bulk-dialog">
      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.changeType")}</div>
        <Seg className="sdk-seg-fill sdk-seg-lg" value={mode} onChange={setMode} label={t("shopDesk.changeType")} items={PRICE_MODES.map((m) => ({ id: m, label: t(`shopDesk.pm.${m}`) }))} />
      </div>
      {mode === "sale" ? (
        <div className="sdk-grid3">
          <label className="dsr-field">
            <span className="dsr-lab">{t("shopDesk.discount")}</span>
            <span className="sdk-input sdk-suffix is-big">
              <input className="tnum" inputMode="numeric" value={`%${pct}`} onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, "").slice(0, 2))} data-autofocus />
              <span>{t("shopDesk.listReturns")}</span>
            </span>
          </label>
          <label className="dsr-field">
            <span className="dsr-lab">{t("shopDesk.starts")}</span>
            <input type="datetime-local" className="sdk-input" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="dsr-field">
            <span className="dsr-lab">{t("shopDesk.ends")}</span>
            <input type="datetime-local" className="sdk-input" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
      ) : (
        <div className="sdk-row2f">
          <label className="dsr-field">
            <span className="dsr-lab">{fieldLabel}</span>
            <span className="sdk-input sdk-suffix is-big">
              <input className="tnum" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={mode === "fixed" ? "1500" : mode === "delta" ? "-200" : "-%15"} data-autofocus />
              <span>{hint}</span>
            </span>
          </label>
          <label className="dsr-field">
            <span className="dsr-lab">{t("shopDesk.rounding")}</span>
            <select className="sdk-input" value={rounding} onChange={(e) => setRounding(e.target.value)}>
              {ROUNDINGS.map((r) => (
                <option key={r} value={r}>
                  {t(`shopDesk.round.${r}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.preview")}</div>
        <div className="sdk-ptable" role="table">
          <div className="sdk-ptable-h" role="row">
            <span role="columnheader">{t("shopDesk.col.item")}</span>
            <span role="columnheader">{t("shopDesk.now")}</span>
            <span role="columnheader">{t("shopDesk.newCol")}</span>
          </div>
          {rows.slice(0, 8).map((r) => (
            <div key={r.id} className="sdk-ptable-r" role="row">
              <span role="cell" className="sdk-item">
                <ItemThumb item={items.find((it) => it.id === r.id)} size={36} />
                {r.name}
              </span>
              <b role="cell" className="tnum">
                {num(r.now, locale)} DC
              </b>
              <b role="cell" className={`tnum ${r.next == null ? "" : r.up ? "is-up" : r.same ? "" : "is-down"}`}>
                {r.next == null ? "-" : (
                  <>
                    {r.up ? <TrendUpIcon size={18} /> : <TrendDownIcon size={18} />} {num(r.next, locale)} DC
                  </>
                )}
              </b>
            </div>
          ))}
          {rows.length > 8 ? <div className="sdk-ptable-more">{t("shopDesk.andMore", { n: rows.length - 8 })}</div> : null}
        </div>
      </div>

      <div className="sdk-alert is-amber is-block">
        <AlertTriangle size={20} />
        <span>
          {t("shopDesk.ownersWarn", { n: owners == null ? "-" : num(owners, locale) })}
          {limited.length ? ` ${t("shopDesk.limitedWarn", { name: limited[0].it.name, n: num(limited[0].s.left, locale) })}` : ""}
        </span>
      </div>

      <label className="dsr-field">
        <span className="dsr-lab">{t("shopDesk.reasonRequired")}</span>
        <textarea className="sdk-input sdk-textarea" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("shopDesk.reasonPh")} />
      </label>
      <label className="sdk-checkline">
        <GlassCheckbox checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
        {t("shopDesk.announce")}
      </label>
      <DialogError text={err} />
      <DialogActions
        onCancel={onClose}
        cancelLabel={t("shopDesk.cancel")}
        busy={busy}
        disabled={!ok}
        onSubmit={submit}
        submitLabel={busy ? t("shopDesk.working") : t("shopDesk.updateN", { n: items.length })}
        icon={Check}
      />
    </DossierDialog>
  );
}
