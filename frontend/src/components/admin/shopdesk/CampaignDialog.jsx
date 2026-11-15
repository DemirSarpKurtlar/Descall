/**
 * Kampanya: scheduled discount (all / categories / chosen items), a limited drop (items
 * visible only in the window, optional stock per item) or a storefront window that shows
 * one storefront section. Draft = saved but not live.
 */
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { Calendar, Trash2, X } from "../../ui/Icon.jsx";
import DossierDialog, { DialogActions, DialogError } from "../dossier/DossierDialog.jsx";
import { CATEGORIES, campaignBody, campaignError, toLocalInput } from "./shopDeskModel.js";
import { ItemPicker, ItemThumb, Seg, Toggle, errMsg } from "./ui.jsx";

function blank(preset) {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return {
    name: "",
    kind: "discount",
    pct: "20",
    scope: "all",
    categories: [],
    itemIds: [],
    sectionId: "",
    startsAt: toLocalInput(start.toISOString()),
    endsAt: toLocalInput(end.toISOString()),
    stockPerItem: "",
    enabled: true,
    note: "",
    ...(preset || {}),
  };
}

function fromCampaign(c) {
  const s = c.scope || {};
  return {
    name: c.name,
    kind: c.kind,
    pct: c.discount_pct ? String(c.discount_pct) : "20",
    scope: s.all ? "all" : s.categories?.length ? "categories" : "items",
    categories: s.categories || [],
    itemIds: s.itemIds || [],
    sectionId: s.sectionId || "",
    startsAt: toLocalInput(c.starts_at),
    endsAt: toLocalInput(c.ends_at),
    stockPerItem: "",
    enabled: c.enabled !== false,
    note: c.note || "",
  };
}

export default function CampaignDialog({ open, campaignId, preset, campaigns, sections, items, onClose, onDone }) {
  const { t } = useLocale();
  const existing = campaigns.find((c) => c.id === campaignId) || null;
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pick, setPick] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(existing ? fromCampaign(existing) : blank(preset));
    setErr("");
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const errKey = campaignError(form);
  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const submit = async () => {
    if (errKey) {
      setErr(t(`shopDesk.campErr.${errKey}`));
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const body = campaignBody(form);
      if (existing) await adminFetch(`/shop/campaigns/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await adminFetch("/shop/campaigns", { method: "POST", body: JSON.stringify(body) });
      onDone?.(existing ? t("shopDesk.campSaved", { name: body.name }) : t("shopDesk.campCreated", { name: body.name }));
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await adminFetch(`/shop/campaigns/${existing.id}`, { method: "DELETE" });
      onDone?.(t("shopDesk.campDeleted", { name: existing.name }));
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DossierDialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Calendar}
      tone="blue"
      title={existing ? t("shopDesk.campEdit") : t("shopDesk.campNew")}
      subtitle={t("shopDesk.campSub")}
      width={680}
      testId="sdk-campaign-dialog"
    >
      <label className="dsr-field">
        <span className="dsr-lab">{t("shopDesk.campName")}</span>
        <input className="sdk-input" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder={t("shopDesk.campNamePh")} data-autofocus />
      </label>
      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.campKind")}</div>
        <Seg className="sdk-seg-fill" value={form.kind} onChange={(k) => set({ kind: k })} label={t("shopDesk.campKind")} items={["discount", "drop", "storefront"].map((k) => ({ id: k, label: t(`shopDesk.ck.${k}`) }))} />
        <p className="dsr-hint">{t(`shopDesk.ckHint.${form.kind}`)}</p>
      </div>
      <div className="sdk-row2f">
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.starts")}</span>
          <input type="datetime-local" className="sdk-input" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
        </label>
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.ends")}</span>
          <input type="datetime-local" className="sdk-input" value={form.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
        </label>
      </div>
      {form.kind === "discount" ? (
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.discount")}</span>
          <span className="sdk-input sdk-suffix">
            <input className="tnum" inputMode="numeric" value={`%${form.pct}`} onChange={(e) => set({ pct: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
            <span>{t("shopDesk.bestWins")}</span>
          </span>
        </label>
      ) : null}
      {form.kind === "storefront" ? (
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.campSection")}</span>
          <select className="sdk-input" value={form.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
            <option value="">{t("shopDesk.pick")}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="dsr-field">
          <div className="dsr-lab">{t("shopDesk.campScope")}</div>
          <Seg
            small
            value={form.kind === "drop" ? "items" : form.scope}
            onChange={(s) => set({ scope: s })}
            label={t("shopDesk.campScope")}
            items={[
              { id: "all", label: t("shopDesk.scope.all"), disabled: form.kind === "drop" },
              { id: "categories", label: t("shopDesk.scope.categories"), disabled: form.kind === "drop" },
              { id: "items", label: t("shopDesk.scope.items") },
            ]}
          />
          {form.kind !== "drop" && form.scope === "categories" ? (
            <div className="sdk-togchips">
              {CATEGORIES.filter((c) => c !== "sound_pack").map((c) => {
                const on = form.categories.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} className={on ? "is-on" : ""} onClick={() => set({ categories: on ? form.categories.filter((x) => x !== c) : [...form.categories, c] })}>
                    {t(`shopDesk.cat.${c}`)}
                  </button>
                );
              })}
            </div>
          ) : null}
          {form.kind === "drop" || form.scope === "items" ? (
            <>
              <ItemPicker
                items={items.filter((it) => !form.itemIds.includes(it.id))}
                value={pick}
                onChange={(id) => {
                  if (id) set({ itemIds: [...form.itemIds, id] });
                  setPick("");
                }}
              />
              {form.itemIds.length ? (
                <div className="sdk-chips">
                  {form.itemIds.map((id) => {
                    const it = itemsById.get(id);
                    return (
                      <span key={id} className="sdk-chip-user">
                        <ItemThumb item={it} size={20} />
                        {it?.name || id}
                        <button type="button" onClick={() => set({ itemIds: form.itemIds.filter((x) => x !== id) })} aria-label={t("shopDesk.remove")}>
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      )}
      {form.kind === "drop" ? (
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.stockPerItem")}</span>
          <span className="sdk-input sdk-suffix">
            <input className="tnum" inputMode="numeric" value={form.stockPerItem} placeholder={t("shopDesk.unlimited")} onChange={(e) => set({ stockPerItem: e.target.value.replace(/[^\d]/g, "") })} />
            <span>{t("shopDesk.units")}</span>
          </span>
        </label>
      ) : null}
      <div className="sdk-checkline">
        <Toggle checked={form.enabled} onChange={(on) => set({ enabled: on })} label={t("shopDesk.campLive")} />
        <span>{form.enabled ? t("shopDesk.campLive") : t("shopDesk.campDraft")}</span>
      </div>
      <DialogError text={err} />
      <div className="sdk-dlg-acts">
        {existing ? (
          <button type="button" className="dsr-btn is-danger" onClick={remove} disabled={busy}>
            <Trash2 size={16} />
            {confirmDelete ? t("shopDesk.confirmDelete") : t("shopDesk.delete")}
          </button>
        ) : null}
        <span className="sdk-grow" />
        <DialogActions onCancel={onClose} cancelLabel={t("shopDesk.cancel")} busy={busy} disabled={false} onSubmit={submit} submitLabel={busy ? t("shopDesk.working") : existing ? t("shopDesk.save") : t("shopDesk.campCreate")} icon={Calendar} />
      </div>
    </DossierDialog>
  );
}
