/**
 * Draft A "Ürün düzenleme çekmecesi": right-side drawer with Düzenle (live preview, name,
 * image / effect, rarity, price + scheduled discount, stock / end of sale / storefront),
 * Satışlar (per-item sales from shop_purchases), Sahipler and Değişiklik geçmişi (audit).
 * Also creates new items. Esc / scrim close, focus stays inside, focus returns on close.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adminFetch } from "../../../api/adminHttp";
import { useLocale } from "../../../context/LocaleContext";
import {
  BarChart3, Box, Calendar, Check, Clock, Coins, ExternalLink, Eye, Gift, History, Lock, Upload, Users, X,
} from "../../ui/Icon.jsx";
import { Power } from "./shopDeskIcons.js";
import { EFFECT_KEY_OPTIONS, THEME_KEY_GROUPS } from "./catalogKeys.js";
import { CATEGORIES, EFFECT_CATEGORIES, IMAGE_CATEGORIES, RARITIES, discounted, fromLocalInput, num, toLocalInput } from "./shopDeskModel.js";
import { Ava, Bars, Empty, ItemThumb, NewTag, Pill, RarityPill, Seg, Skel, Toggle, UserPicker, errMsg } from "./ui.jsx";
import ItemPreview from "./ItemPreview.jsx";
import { isDesktopShell } from "../../../lib/desktopShell.js";
import { PUBLIC_SITE_ORIGIN } from "../../../lib/referral.js";

/**
 * "Open in shop" from the admin window. In the desktop apps a relative link resolved to the
 * app's own scheme (descall://app/...), which the new-window handler refuses to hand to the
 * browser, so the button did nothing; there it opens the web shop instead.
 */
export function shopPageHref(desktop = isDesktopShell()) {
  return desktop ? `${PUBLIC_SITE_ORIGIN}/settings/shop` : "/settings/shop";
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const MAX_ASSET_BYTES = 700_000;
const AUDIT_ACTIONS = new Set(["shop_item_update", "shop_item_create", "shop_campaign_create"]);

function useTrap(open, ref, onClose, busy) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.stopPropagation();
        if (!busyRef.current) closeRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const list = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const raf = requestAnimationFrame(() => ref.current?.querySelector("[data-autofocus]")?.focus?.({ preventScroll: true }) || ref.current?.focus?.({ preventScroll: true }));
    return () => {
      window.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(raf);
      try {
        opener?.focus?.({ preventScroll: true });
      } catch {
        /* gone */
      }
    };
  }, [open, ref]);
}

function emptyForm(item) {
  const sale = Number(item?.sale_pct) > 0;
  return {
    category: item?.category || "banner",
    sku: item?.sku || "",
    name: item?.name || "",
    description: item?.description || "",
    assetUrl: item?.asset_url || "",
    assetName: "",
    effectKey: item?.effect_key || "",
    themeKey: item?.theme_key || "",
    rarity: item?.rarity || "common",
    price: String(item?.price_descoin ?? 250),
    saleOn: sale,
    salePct: sale ? String(item.sale_pct) : "",
    saleStartsAt: toLocalInput(item?.sale_starts_at),
    saleEndsAt: toLocalInput(item?.sale_ends_at),
    stockLimit: item?.stock_limit == null ? "" : String(item.stock_limit),
    availableUntil: toLocalInput(item?.available_until),
    sectionId: "",
    active: item ? Boolean(item.active) : true,
  };
}

export default function ItemDrawer({ open, state, items, sections, onClose, onSaved, onTab, onCreated, openPerson, openGift }) {
  const { t, locale } = useLocale();
  const ref = useRef(null);
  const titleId = useId();
  const creating = Boolean(state?.create);
  const id = state?.id || null;
  const tab = creating ? "edit" : state?.tab || "edit";
  const [detail, setDetail] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState(emptyForm(null));
  const [initial, setInitial] = useState(emptyForm(null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [pvMode, setPvMode] = useState("profile");
  const [pvBg, setPvBg] = useState("dark");
  const [pvUser, setPvUser] = useState(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const listed = items.find((it) => it.id === id) || null;
  const manualSections = sections.filter((s) => s.kind === "manual");

  const load = useCallback(async () => {
    if (!id) return;
    setLoadErr("");
    try {
      const d = await adminFetch(`/shop/items/${id}/detail`);
      setDetail(d);
      const f = emptyForm(d.item);
      f.sectionId = manualSections.find((s) => (d.sectionIds || []).includes(s.id))?.id || "";
      setForm(f);
      setInitial(f);
    } catch (e) {
      setLoadErr(errMsg(t, e, "shopDesk.loadError"));
    }
    // sections only matter for the initial pick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, t]);

  useEffect(() => {
    if (!open) return;
    setErr("");
    setRangeOpen(false);
    if (creating) {
      setDetail(null);
      const f = emptyForm(null);
      setForm(f);
      setInitial(f);
    } else {
      setDetail(null);
      if (listed) {
        const f = emptyForm(listed);
        setForm(f);
        setInitial(f);
      }
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id, creating]);

  useTrap(open, ref, onClose, busy);

  const item = detail?.item || listed;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const price = Math.max(0, Math.round(Number(form.price) || 0));
  const pct = form.saleOn ? Math.max(0, Math.min(95, Math.round(Number(form.salePct) || 0))) : 0;
  const salePrice = discounted(price, pct);
  const stockSold = Number(item?.stock_sold) || 0;
  const stockLimit = form.stockLimit === "" ? null : Math.round(Number(form.stockLimit));

  const previewItem = useMemo(() => {
    const base = item || {};
    const now = Date.now();
    const saleActive = pct > 0 && (!form.saleStartsAt || Date.parse(form.saleStartsAt) <= now) && (!form.saleEndsAt || Date.parse(form.saleEndsAt) > now);
    return {
      ...base,
      category: form.category,
      name: form.name,
      rarity: form.rarity,
      effect_key: form.effectKey || base.effect_key,
      theme_key: form.themeKey || base.theme_key,
      asset_url: form.assetUrl || base.asset_url,
      preview_url: form.assetUrl ? null : base.preview_url,
      price_descoin: saleActive ? salePrice : price,
      list_price_descoin: price,
      discount_pct: saleActive ? pct : 0,
      sale_ends_at: saleActive ? fromLocalInput(form.saleEndsAt) : null,
      stock_limit: stockLimit,
      stock_left: stockLimit == null ? null : Math.max(0, stockLimit - stockSold),
      sold_out: stockLimit != null && stockSold >= stockLimit,
      available_until: fromLocalInput(form.availableUntil),
    };
  }, [item, form, pct, price, salePrice, stockLimit, stockSold]);

  const validate = () => {
    if (!form.name.trim()) return t("shopDesk.errName");
    if (creating && !/^[a-z0-9][a-z0-9-]{1,60}$/.test(form.sku.trim())) return t("shopDesk.errSku");
    if (creating && IMAGE_CATEGORIES.has(form.category) && !form.assetUrl) return t("shopDesk.errImage");
    if (creating && EFFECT_CATEGORIES.has(form.category) && !form.effectKey) return t("shopDesk.errEffect");
    if (creating && form.category === "theme" && !form.themeKey) return t("shopDesk.errTheme");
    if (form.saleOn && !(pct >= 1)) return t("shopDesk.errPct");
    if (form.saleOn && form.saleStartsAt && form.saleEndsAt && Date.parse(form.saleEndsAt) <= Date.parse(form.saleStartsAt)) return t("shopDesk.errWindow");
    if (stockLimit != null && (!Number.isFinite(stockLimit) || stockLimit < stockSold)) return t("shopDesk.errStock", { n: num(stockSold, locale) });
    return "";
  };

  const merchBody = () => ({
    stockLimit: stockLimit,
    availableUntil: fromLocalInput(form.availableUntil),
    salePct: form.saleOn ? pct : null,
    saleStartsAt: form.saleOn ? fromLocalInput(form.saleStartsAt) : null,
    saleEndsAt: form.saleOn ? fromLocalInput(form.saleEndsAt) : null,
  });

  const save = async (extra = {}) => {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      if (creating) {
        const r = await adminFetch("/shop/items", {
          method: "POST",
          body: JSON.stringify({
            sku: form.sku.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            category: form.category,
            assetUrl: form.assetUrl || undefined,
            previewUrl: form.assetUrl || undefined,
            priceDescoin: price,
            themeKey: form.category === "theme" ? form.themeKey : undefined,
            effectKey: EFFECT_CATEGORIES.has(form.category) ? form.effectKey : undefined,
            rarity: form.rarity,
          }),
        });
        const newId = r.item?.id;
        const merch = merchBody();
        const hasMerch = merch.stockLimit != null || merch.availableUntil || merch.salePct || form.sectionId;
        if (newId && hasMerch) {
          await adminFetch(`/shop/desk/items/${newId}`, { method: "PATCH", body: JSON.stringify({ ...merch, sectionIds: form.sectionId ? [form.sectionId] : undefined }) }).catch(() => {});
        }
        onSaved?.(t("shopDesk.toastCreated", { name: form.name.trim() }));
        if (newId) onCreated?.(newId);
        return;
      }
      const body = { ...extra };
      if (form.name !== initial.name) body.name = form.name.trim();
      if (form.description !== initial.description) body.description = form.description;
      if (form.rarity !== initial.rarity) body.rarity = form.rarity;
      if (form.price !== initial.price) body.priceDescoin = price;
      if (form.assetUrl !== initial.assetUrl) {
        body.assetUrl = form.assetUrl;
        body.previewUrl = form.assetUrl;
      }
      if (form.effectKey !== initial.effectKey) body.effectKey = form.effectKey;
      if (form.themeKey !== initial.themeKey) body.themeKey = form.themeKey;
      const m = merchBody();
      const im = { stockLimit: initial.stockLimit, availableUntil: initial.availableUntil, saleOn: initial.saleOn, salePct: initial.salePct, saleStartsAt: initial.saleStartsAt, saleEndsAt: initial.saleEndsAt };
      if (form.stockLimit !== im.stockLimit) body.stockLimit = m.stockLimit;
      if (form.availableUntil !== im.availableUntil) body.availableUntil = m.availableUntil;
      if (form.saleOn !== im.saleOn || form.salePct !== im.salePct || form.saleStartsAt !== im.saleStartsAt || form.saleEndsAt !== im.saleEndsAt) {
        body.salePct = m.salePct;
        body.saleStartsAt = m.saleStartsAt;
        body.saleEndsAt = m.saleEndsAt;
      }
      if (form.sectionId !== initial.sectionId) {
        const others = (detail?.sectionIds || []).filter((sid) => sid !== initial.sectionId);
        body.sectionIds = form.sectionId ? [...others, form.sectionId] : others;
      }
      await adminFetch(`/shop/desk/items/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved?.(extra.active === false ? t("shopDesk.toastDeactivated", { name: form.name }) : extra.active === true ? t("shopDesk.toastActivated", { name: form.name }) : t("shopDesk.toastSaved", { name: form.name }));
      await load();
    } catch (e) {
      setErr(errMsg(t, e));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > MAX_ASSET_BYTES) {
      setErr(t("shopDesk.errImageSize"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ assetUrl: String(reader.result || ""), assetName: file.name });
    reader.readAsDataURL(file);
  };

  if (!open || typeof document === "undefined") return null;
  const created = item?.created_at ? new Date(item.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
  const ownersTotal = detail?.owners?.total;
  const tabs = creating
    ? [{ id: "edit", label: t("shopDesk.dTab.edit") }]
    : [
        { id: "edit", label: t("shopDesk.dTab.edit") },
        { id: "sales", label: <>{t("shopDesk.dTab.sales")} <NewTag /></> },
        { id: "owners", label: ownersTotal == null ? t("shopDesk.dTab.owners") : t("shopDesk.dTab.ownersN", { n: num(ownersTotal, locale) }) },
        { id: "history", label: t("shopDesk.dTab.history") },
      ];

  return createPortal(
    <div className="sdk-drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <aside ref={ref} className="sdk-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid="sdk-drawer">
        <header className="sdk-dr-head">
          {creating ? <span className="sdk-dr-new"><Box size={22} /></span> : <ItemThumb item={previewItem} size={58} />}
          <div className="sdk-dr-titles">
            <h2 id={titleId}>
              {creating ? t("shopDesk.createTitle") : form.name || item?.name}
              {!creating ? <RarityPill rarity={form.rarity} /> : null}
              {!creating && item ? (
                <Pill tone={item.active ? "green" : "gray"}>{item.retired ? t("shopDesk.status.retired") : item.active ? t("shopDesk.activeUpper") : t("shopDesk.inactiveUpper")}</Pill>
              ) : null}
            </h2>
            <p>{creating ? t("shopDesk.createSub") : <><code>{item?.sku}</code> · {t(`shopDesk.cat.${form.category}`)} · {t("shopDesk.addedOn", { date: created })}</>}</p>
          </div>
          {!creating ? (
            <a className="sdk-btn" href={shopPageHref()} target="_blank" rel="noreferrer">
              <ExternalLink size={17} />
              {t("shopDesk.openInShop")}
            </a>
          ) : null}
          <button type="button" className="sdk-icon-btn is-lg" onClick={onClose} disabled={busy} aria-label={t("shopDesk.close")}>
            <X size={20} />
          </button>
        </header>
        <nav className="sdk-dr-tabs" role="tablist">
          {tabs.map((tb) => (
            <button key={tb.id} type="button" role="tab" aria-selected={tab === tb.id} className={tab === tb.id ? "is-on" : ""} onClick={() => onTab(tb.id)}>
              {tb.label}
            </button>
          ))}
        </nav>

        <div className="sdk-dr-body">
          {loadErr ? <p className="sdk-err">{loadErr}</p> : null}
          {tab === "edit" ? (
            <EditPane
              creating={creating}
              form={form}
              set={set}
              item={item}
              previewItem={previewItem}
              pvMode={pvMode}
              setPvMode={setPvMode}
              pvBg={pvBg}
              setPvBg={setPvBg}
              pvUser={pvUser}
              setPvUser={setPvUser}
              price={price}
              pct={pct}
              salePrice={salePrice}
              stockSold={stockSold}
              stockLimit={stockLimit}
              manualSections={manualSections}
              rangeOpen={rangeOpen}
              setRangeOpen={setRangeOpen}
              pickFile={pickFile}
            />
          ) : tab === "sales" ? (
            <SalesPane detail={detail} openPerson={openPerson} />
          ) : tab === "owners" ? (
            <OwnersPane id={id} detail={detail} openPerson={openPerson} />
          ) : (
            <HistoryPane detail={detail} />
          )}
        </div>

        <footer className="sdk-dr-foot">
          <span className="sdk-muted">
            <History size={16} />
            {t("shopDesk.auditNote")}
          </span>
          <span className="sdk-grow" />
          {err ? (
            <span className="sdk-err" role="alert">
              {err}
            </span>
          ) : null}
          {!creating && item && !item.retired ? (
            item.active ? (
              <button type="button" className="sdk-btn is-danger-outline" disabled={busy} onClick={() => save({ active: false })}>
                <Power size={17} />
                {t("shopDesk.deactivate")}
              </button>
            ) : (
              <button type="button" className="sdk-btn" disabled={busy} onClick={() => save({ active: true })}>
                <Power size={17} />
                {t("shopDesk.activate")}
              </button>
            )
          ) : null}
          {!creating ? (
            <button type="button" className="sdk-btn" disabled={busy} onClick={() => openGift?.({ itemId: id })}>
              <Gift size={17} />
              {t("shopDesk.menu.gift")}
            </button>
          ) : null}
          <button type="button" className="sdk-btn" onClick={onClose} disabled={busy}>
            {t("shopDesk.cancel")}
          </button>
          <button type="button" className="sdk-btn is-primary" onClick={() => save()} disabled={busy || (!creating && !dirty)} data-testid="sdk-drawer-save">
            <Check size={17} />
            {busy ? t("shopDesk.working") : creating ? t("shopDesk.create") : t("shopDesk.save")}
          </button>
        </footer>
      </aside>
    </div>,
    document.body
  );
}

function EditPane(p) {
  const { t, locale } = useLocale();
  const { creating, form, set, item, previewItem } = p;
  const effectOptions = EFFECT_KEY_OPTIONS[form.category] || [];
  const stockPct = p.stockLimit ? Math.min(100, Math.round((p.stockSold / Math.max(1, p.stockLimit)) * 100)) : 0;
  const saleStart = form.saleStartsAt ? new Date(form.saleStartsAt) : null;
  const saleEnd = form.saleEndsAt ? new Date(form.saleEndsAt) : null;
  const short = (d) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const long = (d) => `${d.toLocaleDateString(locale, { day: "numeric", month: "short" })} ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <>
      <section className="sdk-pane sdk-pv-pane">
        <div className="sdk-pane-head">
          <h3>
            <Eye size={19} />
            {t("shopDesk.livePreview")}
            <NewTag />
          </h3>
          <Seg
            small
            value={p.pvMode}
            onChange={p.setPvMode}
            label={t("shopDesk.livePreview")}
            items={[
              { id: "profile", label: t("shopDesk.pv.profile") },
              { id: "members", label: t("shopDesk.pv.members") },
              { id: "card", label: t("shopDesk.pv.card") },
            ]}
          />
        </div>
        <div className="sdk-pv-grid">
          <ItemPreview item={previewItem} me={p.pvUser} mode={p.pvMode} bg={p.pvBg} />
          <div className="sdk-pv-side">
            <div className="sdk-lab-l">{t("shopDesk.previewUser")}</div>
            <UserPicker value={p.pvUser} onChange={p.setPvUser} placeholder={t("shopDesk.previewUserPh")} />
            <div className="sdk-lab-l">{t("shopDesk.background")}</div>
            <Seg
              small
              value={p.pvBg}
              onChange={p.setPvBg}
              label={t("shopDesk.background")}
              items={[
                { id: "dark", label: t("shopDesk.bg.dark") },
                { id: "light", label: t("shopDesk.bg.light") },
                { id: "midnight", label: t("shopDesk.bg.midnight") },
              ]}
            />
            <p className="sdk-muted">{t("shopDesk.previewHint")}</p>
          </div>
        </div>
      </section>

      <div className="sdk-form2">
        {creating ? (
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.category")}</span>
            <select className="sdk-input" value={form.category} onChange={(e) => set({ category: e.target.value, effectKey: "", themeKey: "", assetUrl: "", assetName: "" })}>
              {CATEGORIES.filter((c) => c !== "countries" && c !== "sound_pack").map((c) => (
                <option key={c} value={c}>
                  {t(`shopDesk.cat.${c}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="sdk-field">
          <span className="sdk-lab">{t("shopDesk.name")}</span>
          <input className="sdk-input" value={form.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} data-autofocus />
        </label>
        <label className="sdk-field">
          <span className="sdk-lab">{t("shopDesk.sku")}</span>
          {creating ? (
            <input className="sdk-input mono" value={form.sku} maxLength={60} onChange={(e) => set({ sku: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder={t("shopDesk.skuPh")} />
          ) : (
            <span className="sdk-input mono is-locked">
              {form.sku}
              <Lock size={16} />
            </span>
          )}
        </label>
        {IMAGE_CATEGORIES.has(form.category) ? (
          <div className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.image")}</span>
            <label className="sdk-input mono sdk-file">
              <span>{form.assetName || (form.assetUrl ? `${item?.sku || form.sku || "image"}.svg` : t("shopDesk.noImage"))}</span>
              <span className="sdk-link">
                <Upload size={15} />
                {t("shopDesk.change")}
              </span>
              <input type="file" accept="image/svg+xml,image/png,image/jpeg,image/webp,image/gif" onChange={(e) => p.pickFile(e.target.files?.[0])} />
            </label>
          </div>
        ) : form.category === "theme" ? (
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.themeKey")}</span>
            <select className="sdk-input" value={form.themeKey} onChange={(e) => set({ themeKey: e.target.value })} disabled={!creating}>
              <option value="">{t("shopDesk.pick")}</option>
              {THEME_KEY_GROUPS.map((g) => (
                <optgroup key={g.label} label={t(g.label)}>
                  {g.options.map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        ) : EFFECT_CATEGORIES.has(form.category) ? (
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.effectKey")}</span>
            <select className="sdk-input mono" value={form.effectKey} onChange={(e) => set({ effectKey: e.target.value })}>
              <option value="">{t("shopDesk.pick")}</option>
              {[...new Set([form.effectKey, ...effectOptions].filter(Boolean))].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.image")}</span>
            <span className="sdk-input is-locked">{t("shopDesk.managedByMigration")}</span>
          </div>
        )}
        <div className="sdk-field">
          <span className="sdk-lab">{t("shopDesk.rarityLabel")}</span>
          <Seg small className="sdk-seg-fill" value={form.rarity} onChange={(r) => set({ rarity: r })} label={t("shopDesk.rarityLabel")} items={RARITIES.map((r) => ({ id: r, label: t(`shopDesk.rarity.${r}`) }))} />
        </div>
      </div>

      <section className="sdk-pane">
        <div className="sdk-pane-head">
          <h3>
            <Coins size={19} />
            {t("shopDesk.priceAndSale")}
            <NewTag />
          </h3>
          <Toggle checked={form.saleOn} onChange={(on) => set({ saleOn: on, salePct: on && !form.salePct ? "20" : form.salePct })} label={t("shopDesk.saleToggle")} />
        </div>
        <div className="sdk-grid3">
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.listPrice")}</span>
            <span className="sdk-input sdk-suffix">
              <input className="tnum" inputMode="numeric" value={form.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, "") })} />
              <span>DesCoin</span>
            </span>
          </label>
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.discount")}</span>
            <span className={`sdk-input sdk-suffix${form.saleOn ? "" : " is-off"}`}>
              <input className="tnum" inputMode="numeric" value={form.saleOn ? `%${form.salePct}` : ""} placeholder="%0" disabled={!form.saleOn} onChange={(e) => set({ salePct: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })} />
              {form.saleOn && p.pct ? <b className="sdk-amber tnum">{num(p.salePrice, locale)} DC</b> : null}
            </span>
          </label>
          <div className="sdk-field sdk-range">
            <span className="sdk-lab">{t("shopDesk.window")}</span>
            <button type="button" className={`sdk-input sdk-range-btn${form.saleOn ? "" : " is-off"}`} disabled={!form.saleOn} aria-expanded={p.rangeOpen} onClick={() => p.setRangeOpen(!p.rangeOpen)}>
              <Calendar size={17} />
              {saleStart || saleEnd ? `${saleStart ? short(saleStart) : t("shopDesk.now")} - ${saleEnd ? short(saleEnd) : t("shopDesk.noEnd")}` : t("shopDesk.pickDates")}
            </button>
            {p.rangeOpen ? (
              <div className="sdk-pop" role="group" aria-label={t("shopDesk.window")}>
                <label>
                  <span className="sdk-lab">{t("shopDesk.starts")}</span>
                  <input type="datetime-local" className="sdk-input" value={form.saleStartsAt} onChange={(e) => set({ saleStartsAt: e.target.value })} />
                </label>
                <label>
                  <span className="sdk-lab">{t("shopDesk.ends")}</span>
                  <input type="datetime-local" className="sdk-input" value={form.saleEndsAt} onChange={(e) => set({ saleEndsAt: e.target.value })} />
                </label>
                <button type="button" className="sdk-btn is-primary" onClick={() => p.setRangeOpen(false)}>
                  {t("shopDesk.done")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <p className="sdk-hint">
          {form.saleOn && p.pct
            ? t("shopDesk.saleHint", {
                start: saleStart ? long(saleStart) : t("shopDesk.now"),
                end: saleEnd ? long(saleEnd) : t("shopDesk.noEnd"),
                price: num(p.price, locale),
              })
            : t("shopDesk.saleHintOff")}
        </p>
      </section>

      <section className="sdk-pane">
        <div className="sdk-pane-head">
          <h3>
            <Box size={19} />
            {t("shopDesk.stockTimeShelf")}
            <NewTag />
          </h3>
        </div>
        <div className="sdk-grid3">
          <div className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.limitedStock")}</span>
            <span className="sdk-input sdk-suffix">
              <input className="tnum" inputMode="numeric" value={form.stockLimit} placeholder={t("shopDesk.unlimited")} onChange={(e) => set({ stockLimit: e.target.value.replace(/[^\d]/g, "") })} aria-label={t("shopDesk.limitedStock")} />
              <span>{p.stockLimit != null ? t("shopDesk.soldN", { n: num(p.stockSold, locale) }) : t("shopDesk.units")}</span>
            </span>
            {p.stockLimit != null ? (
              <span className="sdk-meter is-amber sdk-mt">
                <i style={{ width: `${stockPct}%` }} />
              </span>
            ) : null}
          </div>
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.saleEnd")}</span>
            <span className="sdk-input sdk-prefix">
              <Clock size={17} />
              <input type="datetime-local" value={form.availableUntil} onChange={(e) => set({ availableUntil: e.target.value })} aria-label={t("shopDesk.saleEnd")} />
            </span>
          </label>
          <label className="sdk-field">
            <span className="sdk-lab">{t("shopDesk.shelfSection")}</span>
            <select className="sdk-input" value={form.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
              <option value="">{t("shopDesk.noSection")}</option>
              {p.manualSections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
    </>
  );
}

function SalesPane({ detail, openPerson }) {
  const { t, locale } = useLocale();
  if (!detail) return <Skel h={180} />;
  const s = detail.sales;
  const labels = s.days.map((d, i) => (i % 5 === 4 || i === s.days.length - 1 ? new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" }) : ""));
  return (
    <>
      <div className="sdk-mini-stats">
        <div>
          <b className="tnum">{num(s.total, locale)}</b>
          <small>{t("shopDesk.sales30")}</small>
        </div>
        <div>
          <b className="tnum">{num(s.revenue, locale)} DC</b>
          <small>{t("shopDesk.revenue30")}</small>
        </div>
        <div>
          <b className="tnum">{s.total ? num(Math.round(s.revenue / s.total), locale) : "-"}</b>
          <small>{t("shopDesk.avgPaid")}</small>
        </div>
        <div>
          <b className="tnum">{num(detail.owners?.total ?? 0, locale)}</b>
          <small>{t("shopDesk.ownersTotal")}</small>
        </div>
      </div>
      <section className="sdk-pane">
        <div className="sdk-pane-head">
          <h3>
            <BarChart3 size={19} />
            {t("shopDesk.dailySales")}
          </h3>
        </div>
        <Bars values={s.series} labels={labels} tops={s.series.map((v) => (v ? v : ""))} height={120} ariaLabel={t("shopDesk.dailySales")} />
      </section>
      <section className="sdk-pane">
        <div className="sdk-pane-head">
          <h3>
            <Users size={19} />
            {t("shopDesk.recentBuyers")}
          </h3>
        </div>
        {s.recent.length ? (
          <ul className="sdk-plist">
            {s.recent.map((r) => (
              <li key={r.id}>
                <Ava user={r.user} size={30} />
                <span>
                  <b>{r.user?.displayName || t("shopDesk.deletedUser")}</b>
                  <small>
                    {r.user ? `@${r.user.username} · ` : ""}
                    {new Date(r.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </small>
                </span>
                <b className="tnum">{num(r.amount, locale)} DC</b>
                {r.user ? (
                  <button type="button" className="sdk-link" onClick={() => openPerson?.(r.user.id)}>
                    {t("shopDesk.userFile")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty title={t("shopDesk.noSales")} />
        )}
      </section>
    </>
  );
}

function OwnersPane({ id, detail, openPerson }) {
  const { t, locale } = useLocale();
  const [owners, setOwners] = useState(null);
  useEffect(() => {
    let stop = false;
    adminFetch(`/shop/items/${id}/owners?limit=60`)
      .then((d) => !stop && setOwners(d.owners || []))
      .catch(() => !stop && setOwners([]));
    return () => {
      stop = true;
    };
  }, [id]);
  return (
    <section className="sdk-pane">
      <div className="sdk-pane-head">
        <h3>
          <Users size={19} />
          {t("shopDesk.ownersHead", { n: num(detail?.owners?.total ?? 0, locale) })}
        </h3>
        <span className="sdk-muted">{t("shopDesk.ownersSplit", { p: num(detail?.owners?.purchase ?? 0, locale), g: num(detail?.owners?.gift ?? 0, locale) })}</span>
      </div>
      {!owners ? (
        <Skel h={120} />
      ) : owners.length ? (
        <ul className="sdk-plist">
          {owners.map((o) => (
            <li key={o.id}>
              <Ava user={o.user} size={30} />
              <span>
                <b>{o.user?.displayName || t("shopDesk.deletedUser")}</b>
                <small>
                  {o.user ? `@${o.user.username} · ` : ""}
                  {new Date(o.at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}
                </small>
              </span>
              <Pill tone={o.via === "gift" ? "violet" : o.via === "purchase" ? "blue" : "gray"}>{t(`shopDesk.via.${["gift", "purchase", "voucher", "promo"].includes(o.via) ? o.via : "other"}`)}</Pill>
              {o.user ? (
                <button type="button" className="sdk-link" onClick={() => openPerson?.(o.user.id)}>
                  {t("shopDesk.userFile")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={t("shopDesk.noOwners")} />
      )}
    </section>
  );
}

function HistoryPane({ detail }) {
  const { t, locale } = useLocale();
  if (!detail) return <Skel h={160} />;
  const list = detail.history || [];
  return (
    <section className="sdk-pane">
      <div className="sdk-pane-head">
        <h3>
          <History size={19} />
          {t("shopDesk.dTab.history")}
        </h3>
      </div>
      {list.length ? (
        <ul className="sdk-hist">
          {list.map((h) => {
            const changes = h.meta?.changes ? Object.keys(h.meta.changes) : [];
            return (
              <li key={h.id}>
                <span className="sdk-hist-dot" />
                <div>
                  <b>{AUDIT_ACTIONS.has(h.action) ? t(`shopDesk.audit.${h.action}`) : h.action}</b>
                  <small>
                    {h.actor ? `@${h.actor} · ` : ""}
                    {new Date(h.at).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </small>
                  {changes.length ? (
                    <div className="sdk-hist-ch">
                      {changes.map((k) => {
                        const c = h.meta.changes[k];
                        return (
                          <span key={k}>
                            <code>{k}</code>
                            {c && "from" in c ? ` ${c.from ?? "-"} → ${c.to ?? "-"}` : ""}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  {h.meta?.reason ? <p>{h.meta.reason}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={History} title={t("shopDesk.noHistory")} />
      )}
    </section>
  );
}
