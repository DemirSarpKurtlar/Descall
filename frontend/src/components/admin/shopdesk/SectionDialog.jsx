/** Vitrin bölümü: hand-picked, weekly rotating pool, new, bestsellers, limited or one category. */
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import { ChevronDown, ChevronUp, Star, Trash2, X } from "../../ui/Icon.jsx";
import DossierDialog, { DialogActions, DialogError } from "../dossier/DossierDialog.jsx";
import { CATEGORIES, RARITIES, fromLocalInput, toLocalInput } from "./shopDeskModel.js";
import { ItemPicker, ItemThumb, Seg, Toggle, errMsg } from "./ui.jsx";

const KINDS = ["manual", "rotating", "new", "bestsellers", "limited", "category"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function blank() {
  return { title: "", subtitle: "", kind: "manual", itemIds: [], limit: "12", count: "8", days: "14", weekday: 1, rarities: ["legendary", "mythic"], categories: [], category: "countries", visibleFrom: "", visibleUntil: "", enabled: true };
}

function fromSection(s) {
  const c = s.config || {};
  return {
    title: s.title,
    subtitle: s.subtitle || "",
    kind: s.kind,
    itemIds: s.item_ids || [],
    limit: String(c.limit || 12),
    count: String(c.count || 8),
    days: String(c.days || 14),
    weekday: Number.isInteger(c.weekday) ? c.weekday : 1,
    rarities: c.rarities || [],
    categories: c.categories || [],
    category: c.category || "countries",
    visibleFrom: toLocalInput(s.visible_from),
    visibleUntil: toLocalInput(s.visible_until),
    enabled: s.enabled !== false,
  };
}

export default function SectionDialog({ open, section, items, onClose, onDone }) {
  const { t, locale } = useLocale();
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(section ? fromSection(section) : blank());
    setErr("");
    setConfirmDelete(false);
  }, [open, section]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const toggleIn = (key, v) => set({ [key]: form[key].includes(v) ? form[key].filter((x) => x !== v) : [...form[key], v] });
  const move = (id, d) => {
    const list = [...form.itemIds];
    const i = list.indexOf(id);
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    set({ itemIds: list });
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setErr(t("shopDesk.secErrTitle"));
      return;
    }
    if (form.kind === "manual" && !form.itemIds.length) {
      setErr(t("shopDesk.secErrItems"));
      return;
    }
    const config = { limit: Number(form.limit) || 12 };
    if (form.kind === "rotating") Object.assign(config, { count: Number(form.count) || 8, weekday: form.weekday, rarities: form.rarities, categories: form.categories });
    if (form.kind === "new") config.days = Number(form.days) || 14;
    if (form.kind === "category") config.category = form.category;
    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      kind: form.kind,
      itemIds: form.kind === "manual" ? form.itemIds : [],
      config,
      enabled: form.enabled,
      visibleFrom: fromLocalInput(form.visibleFrom),
      visibleUntil: fromLocalInput(form.visibleUntil),
    };
    setBusy(true);
    setErr("");
    try {
      if (section) await adminFetch(`/shop/sections/${section.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await adminFetch("/shop/sections", { method: "POST", body: JSON.stringify(body) });
      onDone?.(section ? t("shopDesk.secSaved", { name: body.title }) : t("shopDesk.secCreated", { name: body.title }));
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await adminFetch(`/shop/sections/${section.id}`, { method: "DELETE" });
      onDone?.(t("shopDesk.secDeleted", { name: section.title }));
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  const weekdayName = (d) => new Date(Date.UTC(2026, 10, 15 + d)).toLocaleDateString(locale, { weekday: "long", timeZone: "UTC" });

  return (
    <DossierDialog open={open} onClose={onClose} busy={busy} icon={Star} tone="blue" title={section ? t("shopDesk.secEdit") : t("shopDesk.secNew")} subtitle={t("shopDesk.secSub")} width={680} testId="sdk-section-dialog">
      <div className="sdk-row2f">
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.secTitle")}</span>
          <input className="sdk-input" value={form.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} placeholder={t("shopDesk.secTitlePh")} data-autofocus />
        </label>
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.secSubtitle")}</span>
          <input className="sdk-input" value={form.subtitle} maxLength={120} onChange={(e) => set({ subtitle: e.target.value })} placeholder={t("shopDesk.secSubtitlePh")} />
        </label>
      </div>
      <div className="dsr-field">
        <div className="dsr-lab">{t("shopDesk.secKind")}</div>
        <Seg small className="sdk-seg-wrap" value={form.kind} onChange={(k) => set({ kind: k })} label={t("shopDesk.secKind")} items={KINDS.map((k) => ({ id: k, label: t(`shopDesk.sk.${k}`) }))} />
        <p className="dsr-hint">{t(`shopDesk.skHint.${form.kind}`)}</p>
      </div>

      {form.kind === "manual" ? (
        <div className="dsr-field">
          <div className="dsr-lab">{t("shopDesk.secItems", { n: form.itemIds.length })}</div>
          <ItemPicker
            items={items.filter((it) => !form.itemIds.includes(it.id))}
            value={pick}
            onChange={(id) => {
              if (id && form.itemIds.length < 60) set({ itemIds: [...form.itemIds, id] });
              setPick("");
            }}
          />
          <ol className="sdk-orderlist">
            {form.itemIds.map((id, i) => {
              const it = byId.get(id);
              return (
                <li key={id}>
                  <span className="sdk-muted tnum">{i + 1}</span>
                  <ItemThumb item={it} size={28} />
                  <span>{it?.name || id}</span>
                  <button type="button" className="sdk-icon-btn" onClick={() => move(id, -1)} disabled={i === 0} aria-label={t("shopDesk.moveUp")}>
                    <ChevronUp size={15} />
                  </button>
                  <button type="button" className="sdk-icon-btn" onClick={() => move(id, 1)} disabled={i === form.itemIds.length - 1} aria-label={t("shopDesk.moveDown")}>
                    <ChevronDown size={15} />
                  </button>
                  <button type="button" className="sdk-icon-btn" onClick={() => set({ itemIds: form.itemIds.filter((x) => x !== id) })} aria-label={t("shopDesk.remove")}>
                    <X size={15} />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {form.kind === "rotating" ? (
        <>
          <div className="dsr-field">
            <div className="dsr-lab">{t("shopDesk.poolRarity")}</div>
            <div className="sdk-togchips">
              {RARITIES.map((r) => (
                <button key={r} type="button" aria-pressed={form.rarities.includes(r)} className={form.rarities.includes(r) ? "is-on" : ""} onClick={() => toggleIn("rarities", r)}>
                  {t(`shopDesk.rarity.${r}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="dsr-field">
            <div className="dsr-lab">{t("shopDesk.poolCategories")}</div>
            <div className="sdk-togchips">
              {CATEGORIES.filter((c) => c !== "sound_pack").map((c) => (
                <button key={c} type="button" aria-pressed={form.categories.includes(c)} className={form.categories.includes(c) ? "is-on" : ""} onClick={() => toggleIn("categories", c)}>
                  {t(`shopDesk.cat.${c}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="sdk-row2f">
            <label className="dsr-field">
              <span className="dsr-lab">{t("shopDesk.perWeek")}</span>
              <input className="sdk-input tnum" inputMode="numeric" value={form.count} onChange={(e) => set({ count: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
            </label>
            <label className="dsr-field">
              <span className="dsr-lab">{t("shopDesk.rotateOn")}</span>
              <select className="sdk-input" value={form.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d) => (
                  <option key={d} value={d}>
                    {weekdayName(d)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      ) : null}

      {form.kind === "new" ? (
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.newDays")}</span>
          <input className="sdk-input tnum" inputMode="numeric" value={form.days} onChange={(e) => set({ days: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
        </label>
      ) : null}
      {form.kind === "category" ? (
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.category")}</span>
          <select className="sdk-input" value={form.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.filter((c) => c !== "sound_pack").map((c) => (
              <option key={c} value={c}>
                {t(`shopDesk.cat.${c}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {form.kind !== "manual" && form.kind !== "rotating" ? (
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.maxItems")}</span>
          <input className="sdk-input tnum" inputMode="numeric" value={form.limit} onChange={(e) => set({ limit: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
        </label>
      ) : null}

      <div className="sdk-row2f">
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.visibleFrom")}</span>
          <input type="datetime-local" className="sdk-input" value={form.visibleFrom} onChange={(e) => set({ visibleFrom: e.target.value })} />
        </label>
        <label className="dsr-field">
          <span className="dsr-lab">{t("shopDesk.visibleUntil")}</span>
          <input type="datetime-local" className="sdk-input" value={form.visibleUntil} onChange={(e) => set({ visibleUntil: e.target.value })} />
        </label>
      </div>
      <div className="sdk-checkline">
        <Toggle checked={form.enabled} onChange={(on) => set({ enabled: on })} label={t("shopDesk.secOn")} />
        <span>{form.enabled ? t("shopDesk.secOn") : t("shopDesk.secOff")}</span>
      </div>
      <DialogError text={err} />
      <div className="sdk-dlg-acts">
        {section ? (
          <button type="button" className="dsr-btn is-danger" onClick={remove} disabled={busy}>
            <Trash2 size={16} />
            {confirmDelete ? t("shopDesk.confirmDelete") : t("shopDesk.delete")}
          </button>
        ) : null}
        <span className="sdk-grow" />
        <DialogActions onCancel={onClose} cancelLabel={t("shopDesk.cancel")} busy={busy} disabled={false} onSubmit={submit} submitLabel={busy ? t("shopDesk.working") : section ? t("shopDesk.save") : t("shopDesk.secCreate")} icon={Star} />
      </div>
    </DossierDialog>
  );
}
