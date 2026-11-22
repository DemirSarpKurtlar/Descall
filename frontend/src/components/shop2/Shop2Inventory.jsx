// Envanter "Stüdyo" (owner pick, draft A, 22 Nov 2026): big live preview on the left (desktop /
// phone, before / after, where the look shows, palette score) with the saved looks under it;
// on the right the 9 slots (1-9), set progress and the random combo, then the selected slot's
// items (search "/", sort, set filter, chips, grid / list), "Eski koleksiyon" and the equip
// history with "Geri dön". Trying an item is local ("Değişiklik denemede" bar); nobody sees it
// until "Uygula" sends every changed slot in one request (POST /api/shop2/look).
// Phone: sticky collapsing preview, slot chips, 2-column cards, the same bar.
// Also İstek listesi (wishlist with storefront matches).
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import { composeTryOnUser, EQUIP_FIELD, normalizeItem, RARITIES, rarityOf } from "../../lib/shop2Logic.js";
import {
  arrangeLooks,
  buildInventory,
  effectiveLook,
  filterSlotItems,
  historyKind,
  INV_EXTRA,
  INV_SLOTS,
  isTypingTarget,
  lookMatches,
  lookPieceCount,
  mergePending,
  missingPiece,
  paletteReport,
  pendingChanges,
  randomCombo,
  readSeen,
  revertLook,
  setPending,
  setProgressList,
  slotCounts,
  slotForKey,
  slotSets,
  writeSeen,
} from "../../lib/shop2Inventory.js";
import { requestShop2Focus } from "../../lib/shop2Look.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, Price, Seg } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import { applyOutfit as applyOutfitSlots } from "./Shop2Sets.jsx";
import {
  ConfirmDialog,
  HistRow,
  ItemCard,
  LockChips,
  LookTile,
  Menu,
  MenuItem,
  NameDialog,
  PaletteBar,
  PaletteRing,
  PendingBar,
  Places,
  PreviewStage,
  RARITY_COLOR,
  SetBars,
  SetChip,
  SlotButton,
  useAge,
  useStamp,
} from "./Shop2InvParts.jsx";
import { assetSrc, displayNameOf, S2Avatar, S2ChatMessage, S2Name, S2ProfileCard } from "./Shop2Preview.jsx";
import { cssUrl } from "../../lib/cssUrl";
import {
  Archive,
  Bell,
  Bookmark,
  Cart,
  ChevronDown,
  Eye,
  Gift,
  Heart,
  History,
  Layers,
  LayoutGrid,
  List,
  Monitor,
  Package,
  Plus,
  Search,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  SortArrows,
  Split,
  Undo2,
} from "./shop2Icons.jsx";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const SORTS = ["new", "rarity", "name", "value"];

export default function Shop2Inventory() {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const phone = s2.layout === "phone";
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const previewRef = useRef(null);
  const histRef = useRef(null);
  const legacyRef = useRef(null);
  const stamp = useStamp();
  const age = useAge();
  const me = s2.me || {};

  // ---- owned items ------------------------------------------------------------
  const [seen, setSeen] = useState(readSeen);
  const model = useMemo(() => buildInventory(s2.inventory, { seen }), [s2.inventory, seen]);
  const slots = useMemo(() => [...INV_SLOTS, ...model.extras], [model.extras]);
  const ownedIds = useMemo(() => new Set(model.entries.map((e) => e.id)), [model.entries]);
  const hist = s2.data.equipHistory;
  const itemById = useMemo(() => {
    const m = new Map();
    for (const e of model.entries) m.set(e.id, e.item);
    for (const [id, it] of hist?.items || []) if (!m.has(id)) m.set(id, normalizeItem(it));
    return m;
  }, [model.entries, hist]);
  const ownedByCat = useMemo(() => {
    const o = {};
    for (const e of model.entries) (o[e.category] ||= []).push(e.item);
    return o;
  }, [model.entries]);
  const setsByKey = useMemo(() => {
    const o = {};
    for (const s of s2.data.sets || []) o[s.key] = s;
    for (const s of s2.data.storefront?.featuredSets || []) if (!o[s.key]) o[s.key] = s;
    for (const [k, s] of Object.entries(s2.data.setDetails || {})) o[k] = { ...(o[k] || {}), ...s };
    return o;
  }, [s2.data.sets, s2.data.setDetails, s2.data.storefront]);
  const setNameOf = useCallback((key) => (setsByKey[key] ? s2.setName(setsByKey[key]) : ""), [setsByKey, s2]);

  // What is worn now (server truth, from the signed-in user).
  const equipped = {};
  for (const c of [...INV_SLOTS, ...INV_EXTRA, ...model.extras]) {
    const id = s2.equippedIdFor(c);
    equipped[c] = id == null ? null : String(id);
  }
  const equippedKey = JSON.stringify(equipped);
  /** item of an id (owned, else from the history payload, else what the user wears). */
  const itemFor = useCallback((id, category = null) => {
    if (id == null) return null;
    const hit = itemById.get(String(id));
    if (hit) return hit;
    const worn = category ? me[EQUIP_FIELD[category]] : null;
    return worn && sameId(worn.id, id) ? worn : null;
  }, [itemById, me]);

  // ---- pending (tried locally) ----------------------------------------------------
  const [pend, setPend] = useState({ map: {}, stack: [] });
  const pending = pend.map;
  // source: how the changes came ("random", "palette"), sent with "Uygula" for the history.
  const change = useCallback((fn, source = null) => {
    setPend((p) => {
      const next = fn(p.map);
      if (JSON.stringify(next) === JSON.stringify(p.map)) return p;
      return { map: next, stack: [...p.stack.slice(-30), p.map], source };
    });
  }, []);
  // Drop changes that no longer make sense (worn now, item gone after a refund).
  useEffect(() => {
    setPend((p) => {
      const eq = JSON.parse(equippedKey);
      const next = {};
      for (const [c, id] of Object.entries(p.map)) {
        if (String(eq[c] ?? "") === String(id ?? "")) continue;
        if (id != null && !ownedIds.has(String(id))) continue;
        next[c] = id;
      }
      return JSON.stringify(next) === JSON.stringify(p.map) ? p : { map: next, stack: p.stack };
    });
  }, [equippedKey, ownedIds]);
  const changes = pendingChanges(equipped, pending);
  const effective = effectiveLook(equipped, pending);
  const tryOn = {};
  for (const c of changes) tryOn[c.category] = c.to ? itemFor(c.to, c.category) : null;
  const after = useMemo(() => composeTryOnUser(me, tryOn), [me, JSON.stringify(pending), itemById]); // eslint-disable-line react-hooks/exhaustive-deps
  const tryItem = (category, id) => change((p) => setPending(p, equipped, category, id));
  const undoPending = () => setPend((p) => (p.stack.length ? { map: p.stack[p.stack.length - 1], stack: p.stack.slice(0, -1) } : { map: {}, stack: [] }));
  const removeChange = (category) => change((p) => {
    const n = { ...p };
    delete n[category];
    return n;
  });

  // ---- apply ------------------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const undoAction = async (actionId) => {
    try {
      await s2.actions.undo(actionId);
      await s2.onLookChanged?.();
      s2.actions.loadEquipHistory?.();
      s2.toast(t("shop2.log.undoneShort"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.undo"), { tone: "error" });
    }
  };
  /** Wear `look` ({ category: itemId|null }) now; one request, one undoable action. */
  const applyLook = async (look, source = "inventory") => {
    const cats = Object.keys(look || {});
    if (busy || !cats.length) return false;
    setBusy(true);
    try {
      const res = await s2.actions.applyLook(look, source);
      let n = 0;
      if (res === null) {
        // Server without POST /look yet: one slot at a time through /api/shop/equip.
        for (const [c, id] of Object.entries(look)) {
          const item = id ? itemFor(id, c) : itemFor(equipped[c], c);
          // eslint-disable-next-line no-await-in-loop
          if (item && (await s2.onEquip?.(item, !id))) n += 1;
        }
      } else {
        n = Object.keys(res.applied || {}).length;
        await s2.onLookChanged?.();
      }
      setPend((p) => {
        const next = { ...p.map };
        for (const c of cats) delete next[c];
        return { map: next, stack: [] };
      });
      if (n) {
        const one = cats.length === 1 ? cats[0] : null;
        const text = one
          ? look[one]
            ? t("shop2.inv.equippedOne", { name: s2.itemName(itemFor(look[one], one)) })
            : t("shop2.inv.unequippedOne", { name: s2.itemName(itemFor(equipped[one], one)) || t(`shop2.inv.slot.${one}`) })
          : t("shop2.inv.applied", { n });
        s2.toast(text, { tone: "ok", ...(res?.actionId ? { action: { label: t("shop2.inv.undo"), run: () => undoAction(res.actionId) } } : {}) });
      } else if (!res?.unchanged) {
        s2.toast(t("shop2.errors.equip"), { tone: "error" });
      }
      return n > 0;
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.equip"), { tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const applyPending = () => {
    const look = {};
    for (const c of changes) look[c.category] = c.to;
    return applyLook(look, pend.source || "inventory");
  };

  // ---- history ----------------------------------------------------------------
  useEffect(() => {
    s2.actions.loadEquipHistory?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const revert = (entry) => {
    const look = revertLook(entry, ownedIds);
    if (!Object.keys(look).length) {
      s2.toast(t("shop2.errors.equip"), { tone: "error" });
      return;
    }
    applyLook(look, "revert");
  };

  // ---- slot, filters ------------------------------------------------------------
  const [slot, setSlot] = useState(INV_SLOTS[0]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [rarity, setRarity] = useState(null);
  const [setFilterKey, setSetFilterKey] = useState(null);
  const prefs = s2.data.prefs || {};
  const sort = SORTS.includes(prefs.invSort) ? prefs.invSort : "new";
  const view = prefs.invView === "list" ? "list" : "grid";
  const locks = Array.isArray(prefs.invLocks) ? prefs.invLocks.filter((c) => INV_SLOTS.includes(c)) : [];
  const pinnedFirst = prefs.invPinnedFirst !== false;
  const setPref = (patch) => s2.actions.setPref?.(patch);
  const pickSlot = useCallback((c) => {
    setSlot(c);
    setFilter("all");
    setRarity(null);
    setSetFilterKey(null);
  }, []);
  // A slot's new items count as seen once the user leaves the slot.
  const modelRef = useRef(model);
  modelRef.current = model;
  useEffect(() => () => {
    const ids = (modelRef.current.byCat[slot] || []).filter((e) => e.isNew).map((e) => e.id);
    if (!ids.length) return;
    setSeen((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      writeSeen(next);
      return next;
    });
  }, [slot]);
  const entries = model.byCat[slot] || [];
  const counts = slotCounts(entries, { equippedId: equipped[slot] });
  const sets = slotSets(entries);
  const shown = filterSlotItems(entries, { filter, rarity, set: setFilterKey, query, sort, equippedId: equipped[slot], nameOf: s2.itemName, setNameOf, locale });

  // Keyboard: 1-9 switch slots, "/" searches (not while typing, only while visible).
  useEffect(() => {
    const on = (e) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!rootRef.current || rootRef.current.offsetParent === null) return;
      if (document.querySelector(".s2-layer")) return;
      if (isTypingTarget(e.target)) return;
      const c = slotForKey(e.key);
      if (c) {
        pickSlot(c);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [pickSlot]);

  // ---- palette, random combo, sets ------------------------------------------------
  const lookItems = {};
  for (const c of INV_SLOTS) lookItems[c] = itemFor(effective[c], c);
  const report = paletteReport(lookItems, setsByKey, ownedByCat);
  const fixPalette = () => {
    if (!report?.suggestion) return;
    change((p) => setPending(p, equipped, report.suggestion.category, String(report.suggestion.item.id)), "palette");
  };
  const shuffle = () => {
    const combo = randomCombo({ ownedByCat, current: effective, locks });
    if (!Object.keys(combo).length) {
      s2.toast(t("shop2.inv.shuffleNone"), { tone: "info" });
      return;
    }
    change((p) => mergePending(p, equipped, combo), "random");
    if (phone) previewRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  const toggleLock = (c) => setPref({ invLocks: locks.includes(c) ? locks.filter((x) => x !== c) : [...locks, c] });
  const progress = setProgressList(s2.data.sets || []);
  const hintSet = progress.find((s) => s.left > 0) || null;
  const hintDetail = hintSet ? s2.data.setDetails?.[hintSet.key] : null;
  useEffect(() => {
    if (hintSet && !hintDetail) s2.actions.loadSet?.(hintSet.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintSet?.key, Boolean(hintDetail)]);
  const miss = hintDetail ? missingPiece(hintDetail, s2.data.storefront?.slots || []) : null;
  const hint = miss ? { ...miss, setName: setNameOf(miss.setKey), itemName: s2.itemName(miss.item) } : null;
  const openHint = () => {
    if (!miss) return;
    if (miss.inStorefront) requestShop2Focus({ kind: "item", ref: miss.item.id });
    else s2.openSet(miss.setKey);
  };

  // ---- saved looks -------------------------------------------------------------
  const looks = arrangeLooks(s2.data.outfits || [], { pinnedFirst });
  const [dialog, setDialog] = useState(null); // { kind: "save"|"rename"|"delete", look?, items? }
  const lookUser = (look) => composeTryOnUser(me, Object.fromEntries(Object.entries(look || {}).map(([c, id]) => [c, id ? itemFor(id, c) : null])));
  const saveLook = async (name, items) => {
    setDialog(null);
    await s2.actions.saveOutfit(name, items);
    s2.toast(t("shop2.kasa.lookSaved", { name }), { tone: "ok" });
  };
  const currentLookToSave = () => {
    const o = {};
    for (const c of [...INV_SLOTS, ...model.extras]) if (effective[c] !== undefined) o[c] = effective[c];
    return o;
  };
  const wearLook = async (o) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await s2.actions.applyOutfit(o);
      if (res) {
        await s2.onLookChanged?.();
        s2.toast(t("shop2.kasa.lookApplied", { n: Object.keys(res.applied || o.look || {}).length }), { tone: "ok" });
      } else {
        await applyOutfitSlots(s2, { ...o, items: o.look }, t);
      }
      setPend({ map: {}, stack: [] });
      s2.actions.loadEquipHistory?.();
    } finally {
      setBusy(false);
    }
  };
  const previewLook = (o) => {
    change(() => mergePending({}, equipped, o.look));
    if (phone || window.innerHeight < 900) previewRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" });
  };
  const renameLook = async (o, name) => {
    setDialog(null);
    try {
      await s2.actions.updateOutfit(o, { name });
      s2.toast(t("shop2.inv.renamed"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.equip"), { tone: "error" });
    }
  };
  const pinLook = async (o) => {
    try {
      await s2.actions.updateOutfit(o, { pinned: !o.pinned });
      s2.toast(t(o.pinned ? "shop2.inv.unpinnedToast" : "shop2.inv.pinnedToast"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.equip"), { tone: "error" });
    }
  };
  const deleteLook = async (o) => {
    setDialog(null);
    try {
      await s2.actions.deleteOutfit(o);
      s2.toast(t("shop2.inv.deleted"), { tone: "ok" });
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.equip"), { tone: "error" });
    }
  };

  // ---- share, header ------------------------------------------------------------
  const share = () => {
    const dom = report?.setKey ? setsByKey[report.setKey] : null;
    if (dom && Number(dom.ownedCount) >= Number(dom.pieceCount) && dom.pieceCount) {
      s2.openShare?.({ setKey: dom.key });
      return;
    }
    const pick = [slot, ...INV_SLOTS].map((c) => itemFor(equipped[c], c)).find((it) => it && String(it.sku || "").startsWith("s2-") && ownedIds.has(String(it.id)));
    if (pick) s2.openShare?.({ itemId: pick.id });
    else s2.toast(t("shop2.inv.shareNone"), { tone: "info" });
  };
  const [showLegacy, setShowLegacy] = useState(false);
  const goLegacy = () => {
    setShowLegacy(true);
    setTimeout(() => legacyRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 30);
  };
  const goHistory = () => histRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });

  // ---- preview controls ------------------------------------------------------------
  const [mode, setMode] = useState(phone ? "phone" : "desktop");
  const [side, setSide] = useState("after");
  const [split, setSplit] = useState(false);
  const before = me;
  const shownUser = side === "before" ? before : after;

  if (!model.total) {
    return (
      <div className="s2-empty">
        <Package size={28} />
        <h3>{t("shop2.inv.emptyTitle")}</h3>
        <p>{t("shop2.inv.emptyBody")}</p>
        <button type="button" className="s2-btn is-primary" onClick={() => s2.setTab("vitrin")}>{t("shop2.inv.browse")}</button>
      </div>
    );
  }

  // ---- shared pieces -------------------------------------------------------------
  const labelsOf = (it) => s2.itemLabels(it);
  const setChipOf = (it) => {
    const s = it?.set_key ? setsByKey[it.set_key] : null;
    if (!s) return null;
    return <SetChip name={s2.setName(s)} owned={Number(s.ownedCount) || 0} total={Number(s.pieceCount) || 9} palette={s.palette} />;
  };
  const card = (e, big = false) => {
    const eq = sameId(equipped[e.category], e.id);
    const trying = e.category in pending && sameId(pending[e.category], e.id);
    return (
      <ItemCard
        key={e.id}
        entry={e}
        me={me}
        big={big}
        list={view === "list" && !phone}
        name={s2.itemName(e.item)}
        labels={labelsOf(e.item)}
        setChip={setChipOf(e.item)}
        equipped={eq}
        trying={trying}
        busy={busy}
        onTry={() => tryItem(e.category, trying ? equipped[e.category] : e.id)}
        onEquip={() => applyLook({ [e.category]: e.id })}
        onUnequip={() => applyLook({ [e.category]: null })}
      />
    );
  };
  const searchPh = t(`shop2.inv.searchIn.${INV_SLOTS.includes(slot) ? slot : "other"}`);
  const sub = [
    t("shop2.inv.subOwned", { n: counts.all }),
    counts.new ? t("shop2.inv.subNew", { n: counts.new }) : null,
    counts.gift ? t("shop2.inv.subGift", { n: counts.gift }) : null,
  ].filter(Boolean).join(" · ");
  const chips = (
    <>
      {["all", "new", "equipped", "gift"].map((f) => (
        <button key={f} type="button" className={`s2-iv-fchip${filter === f ? " is-on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
          {f === "gift" ? <Gift size={12} /> : null}
          {t(`shop2.inv.filter.${f}`)}
          <span className="s2-num">{counts[f === "all" ? "all" : f]}</span>
        </button>
      ))}
      <span className="s2-iv-vsep" />
      {RARITIES.filter((r) => counts.rarity[r]).map((r) => (
        <button key={r} type="button" className={`s2-iv-fchip${rarity === r ? " is-on" : ""}`} aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? null : r)}>
          <i className="s2-iv-rd" style={{ background: RARITY_COLOR[r] }} />
          {t(`shop2.rarity.${r}`)}
          <span className="s2-num">{counts.rarity[r]}</span>
        </button>
      ))}
    </>
  );
  const sortMenu = (iconOnly) => (
    <Menu label={t("shop2.inv.sort")} button={({ toggle, props }) => (iconOnly ? (
      <button type="button" className="s2-ibtn" onClick={toggle} {...props}><SortArrows size={16} /></button>
    ) : (
      <button type="button" className="s2-iv-dd" onClick={toggle} {...props}><SortArrows size={14} /><span className="s2-iv-ddl">{t("shop2.inv.sort")}:</span><b>{t(`shop2.inv.sortBy.${sort}`)}</b><ChevronDown size={13} /></button>
    ))}>
      {(close) => SORTS.map((x) => <MenuItem key={x} on={sort === x} onClick={() => { setPref({ invSort: x }); close(); }}>{t(`shop2.inv.sortBy.${x}`)}</MenuItem>)}
    </Menu>
  );
  const setMenu = (
    <Menu label={t("shop2.inv.set")} button={({ toggle, props }) => (
      <button type="button" className="s2-iv-dd" onClick={toggle} {...props}><Layers size={14} /><span className="s2-iv-ddl">{t("shop2.inv.set")}:</span><b>{setFilterKey ? setFilterKey === "none" ? t("shop2.inv.setNone") : setNameOf(setFilterKey) : t("shop2.inv.setAll")}</b><ChevronDown size={13} /></button>
    )}>
      {(close) => (
        <>
          <MenuItem on={!setFilterKey} onClick={() => { setSetFilterKey(null); close(); }}>{t("shop2.inv.setAll")}</MenuItem>
          {sets.keys.map((k) => <MenuItem key={k} on={setFilterKey === k} onClick={() => { setSetFilterKey(k); close(); }}>{setNameOf(k) || k}</MenuItem>)}
          {sets.none ? <MenuItem on={setFilterKey === "none"} onClick={() => { setSetFilterKey("none"); close(); }}>{t("shop2.inv.setNone")}</MenuItem> : null}
        </>
      )}
    </Menu>
  );
  const search = (
    <label className="s2-iv-input">
      <Search size={15} />
      <input
        ref={searchRef}
        type="search"
        value={query}
        placeholder={searchPh}
        aria-label={searchPh}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.stopPropagation();
            setQuery("");
          }
        }}
      />
      {!phone ? <kbd>/</kbd> : null}
    </label>
  );
  const grid = shown.length ? (
    <div className={phone ? "s2-iv-pgrid" : view === "list" ? "s2-iv-list" : "s2-iv-grid"}>{shown.map((e) => card(e, phone))}</div>
  ) : entries.length ? (
    <div className="s2-iv-none-box">
      <p className="s2-muted">{t("shop2.inv.noMatch")}</p>
      <button type="button" className="s2-btn is-sm" onClick={() => { setQuery(""); setFilter("all"); setRarity(null); setSetFilterKey(null); }}>{t("shop2.inv.clearFilters")}</button>
    </div>
  ) : (
    <div className="s2-iv-none-box">
      <b>{t("shop2.inv.emptySlotTitle")}</b>
      <p className="s2-muted">{t("shop2.inv.emptySlotBody")}</p>
      <button type="button" className="s2-btn is-sm is-primary" onClick={() => s2.setTab("vitrin")}>{t("shop2.inv.browse")}</button>
    </div>
  );

  const legacy = model.retired.length ? (
    <section className={`s2-iv-legacy${showLegacy ? " is-open" : ""}`} ref={legacyRef}>
      <div className="s2-iv-legacy-h">
        <span className="s2-eyebrow"><Archive size={12} />{t("shop2.inv.legacyN", { n: model.retired.length })}</span>
        {!showLegacy ? model.retired.slice(0, phone ? 1 : 3).map((e) => (
          <span key={e.id} className="s2-iv-lg"><Shop2Art item={e.item} size="chip" me={me} />{s2.itemName(e.item)}</span>
        )) : <span className="s2-iv-legacy-sub s2-muted">{t("shop2.inv.legacyBody")}</span>}
        <button type="button" className="s2-btn is-sm is-ghost s2-iv-legacy-btn" aria-expanded={showLegacy} onClick={() => setShowLegacy((v) => !v)}>
          {t(showLegacy ? "shop2.inv.hide" : "shop2.inv.show")}<ChevronDown size={12} className={showLegacy ? "is-up" : ""} />
        </button>
      </div>
      {showLegacy ? <div className={phone ? "s2-iv-pgrid" : "s2-iv-grid"}>{model.retired.map((e) => card(e, phone))}</div> : null}
    </section>
  ) : null;

  const histEntries = hist?.entries || [];
  const liveRow = changes.length ? (
    <HistRow
      live
      compact={phone}
      time={stamp(Date.now())}
      title={changes.length === 1 ? t("shop2.inv.histKind.trying", { slot: t(`shop2.inv.slot.${changes[0].category}`) }) : t("shop2.inv.histKind.tryingN", { n: changes.length })}
      from={itemFor(changes[0].from, changes[0].category)}
      to={itemFor(changes[0].to, changes[0].category)}
      fromName={changes[0].from ? s2.itemName(itemFor(changes[0].from, changes[0].category)) : t("shop2.inv.none")}
      toName={changes[0].to ? s2.itemName(itemFor(changes[0].to, changes[0].category)) : t("shop2.inv.none")}
      more={changes.length > 1 ? t("shop2.inv.more", { n: changes.length - 1 }) : null}
      button={<button type="button" className="s2-btn is-sm is-ghost" onClick={() => { setSide("after"); setSplit(false); previewRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }}><Eye size={13} />{t("shop2.inv.histTry")}</button>}
    />
  ) : null;
  const histRows = histEntries.slice(0, phone ? 4 : 6).map((e) => {
    const k = historyKind(e);
    const c0 = e.changes[0];
    const from = itemFor(c0.from, c0.category);
    const to = itemFor(c0.to, c0.category);
    const title = k === "slot" ? t("shop2.inv.histKind.slot", { slot: t(`shop2.inv.slot.${c0.category}`) }) : k === "outfit" && e.outfitName ? `${t("shop2.inv.histKind.outfit")} · ${e.outfitName}` : t(`shop2.inv.histKind.${k}`);
    const canRevert = Object.keys(revertLook(e, ownedIds)).length > 0 && e.changes.some((c) => String(equipped[c.category] ?? "") !== String(c.from ?? ""));
    return (
      <HistRow
        key={e.id}
        compact={phone}
        time={stamp(e.at)}
        title={title}
        from={from}
        to={to}
        fromName={from ? s2.itemName(from) : c0.from ? "" : t("shop2.inv.none")}
        toName={to ? s2.itemName(to) : c0.to ? "" : t("shop2.inv.none")}
        more={e.changes.length > 1 ? t("shop2.inv.more", { n: e.changes.length - 1 }) : null}
        button={<button type="button" className="s2-btn is-sm s2-iv-hi-go" disabled={busy || !canRevert} onClick={() => revert(e)}><Undo2 size={13} />{t("shop2.inv.revert")}</button>}
      />
    );
  });
  const history = (
    <section className="s2-iv-hist" ref={histRef}>
      <div className="s2-iv-sec-h">
        <span className="s2-eyebrow"><History size={13} />{t("shop2.inv.hist")}</span>
        {phone ? (
          <button type="button" className="s2-btn is-sm is-ghost" onClick={shuffle}><Shuffle size={13} />{t("shop2.inv.random")}</button>
        ) : (
          <span className="s2-iv-hint">{t("shop2.inv.histSub", { d: hist?.days || 7, n: hist?.total || 0 })}</span>
        )}
      </div>
      <div className="s2-iv-hist-rows">
        {liveRow}
        {histRows}
        {!liveRow && !histRows.length ? <p className="s2-muted s2-iv-hist-empty">{t("shop2.inv.histEmpty")}</p> : null}
      </div>
    </section>
  );

  const looksRow = (
    <div className={phone ? "s2-iv-plooks" : "s2-iv-looks-row"}>
      {looks.length ? looks.map((o) => {
        const on = lookMatches(o.look, equipped);
        const at = o.createdAt || o.created_at;
        return (
          <LookTile
            key={o.id}
            look={o}
            user={lookUser(o.look)}
            on={on}
            auto={o.auto}
            busy={busy}
            pieces={lookPieceCount(o.look)}
            meta={o.auto ? stamp(at ? Date.parse(at) : null) : age(at)}
            onWear={() => wearLook(o)}
            onPreview={() => previewLook(o)}
            onRename={() => setDialog({ kind: "rename", look: o })}
            onPin={() => pinLook(o)}
            onDelete={() => setDialog({ kind: "delete", look: o })}
          />
        );
      }) : <p className="s2-muted s2-iv-looks-empty">{t("shop2.inv.looksEmpty")}</p>}
    </div>
  );
  const dialogs = dialog ? (
    dialog.kind === "save" ? (
      <NameDialog phone={phone} title={t("shop2.inv.saveThis")} onClose={() => setDialog(null)} onSave={(name) => saveLook(name, dialog.items)} />
    ) : dialog.kind === "rename" ? (
      <NameDialog phone={phone} title={t("shop2.inv.rename")} initial={dialog.look.auto ? "" : dialog.look.name || ""} onClose={() => setDialog(null)} onSave={(name) => renameLook(dialog.look, name)} />
    ) : (
      <ConfirmDialog
        phone={phone}
        title={t("shop2.inv.deleteTitle", { name: dialog.look.auto ? t("shop2.kasa.previousLook") : dialog.look.name })}
        body={t("shop2.inv.deleteBody")}
        confirm={t("shop2.inv.delete")}
        onClose={() => setDialog(null)}
        onConfirm={() => deleteLook(dialog.look)}
      />
    )
  ) : null;
  const pbar = (
    <PendingBar
      phone={phone}
      changes={changes}
      itemFor={itemFor}
      busy={busy}
      onRemove={removeChange}
      onUndo={undoPending}
      onSave={() => setDialog({ kind: "save", items: currentLookToSave() })}
      onApply={applyPending}
    />
  );
  const headChips = (
    <>
      <Chip>{t("shop2.inv.count", { n: model.total })}</Chip>
      {model.newCount ? <Chip tone="blue">{t("shop2.inv.newN", { n: model.newCount })}</Chip> : null}
      {model.giftCount ? <Chip tone="red" icon={Gift} className="s2-iv-chip-gift">{t("shop2.inv.giftN", { n: model.giftCount })}</Chip> : null}
      <Chip tone="gold">{t("shop2.inv.value", { n: formatNumber(model.value, locale) })}</Chip>
    </>
  );

  // ---- phone ---------------------------------------------------------------------
  if (phone) {
    return (
      <div className="s2-iv is-phone" ref={rootRef}>
        <PhonePreview
          ref={previewRef}
          user={shownUser}
          mode={mode}
          setMode={setMode}
          side={side}
          setSide={setSide}
          report={report}
          nameOf={s2.itemName}
          setNameOf={setNameOf}
          onFix={fixPalette}
        />
        <div className="s2-iv-pslots" role="tablist" aria-label={t("shop2.inv.slots")}>
          {slots.map((c) => (
            <SlotButton key={c} compact category={c} item={itemFor(effective[c], c)} on={slot === c} pending={c in pending} fresh={(model.byCat[c] || []).some((e) => e.isNew)} onClick={() => pickSlot(c)} />
          ))}
        </div>
        <div className="s2-iv-pfbar">
          {search}
          {sortMenu(true)}
          <Menu label={t("shop2.inv.filters")} button={({ toggle, props }) => (
            <button type="button" className={`s2-ibtn s2-iv-fb${rarity || setFilterKey ? " is-active" : ""}`} onClick={toggle} {...props}>
              <SlidersHorizontal size={16} />
              {rarity || setFilterKey ? <i className="s2-num">{Number(Boolean(rarity)) + Number(Boolean(setFilterKey))}</i> : null}
            </button>
          )}>
            {(close) => (
              <>
                <span className="s2-iv-pop-h">{t("shop2.inv.set")}</span>
                <MenuItem on={!setFilterKey} onClick={() => { setSetFilterKey(null); close(); }}>{t("shop2.inv.setAll")}</MenuItem>
                {sets.keys.map((k) => <MenuItem key={k} on={setFilterKey === k} onClick={() => { setSetFilterKey(k); close(); }}>{setNameOf(k) || k}</MenuItem>)}
                {sets.none ? <MenuItem on={setFilterKey === "none"} onClick={() => { setSetFilterKey("none"); close(); }}>{t("shop2.inv.setNone")}</MenuItem> : null}
              </>
            )}
          </Menu>
        </div>
        <div className="s2-iv-pchips">{chips}</div>
        <div className="s2-iv-psub">
          <b>{t(`shop2.cat.${slot}`)}</b>
          <span className="s2-muted">{t("shop2.inv.subOwned", { n: counts.all })} · {t(`shop2.inv.sortBy.${sort}`)}</span>
        </div>
        {grid}
        <section className="s2-iv-psec">
          <div className="s2-iv-sec-h">
            <span className="s2-eyebrow"><Bookmark size={13} />{t("shop2.inv.looks")}</span>
            <button type="button" className="s2-btn is-sm" onClick={() => setDialog({ kind: "save", items: currentLookToSave() })}><Plus size={13} />{t("shop2.inv.saveShort")}</button>
          </div>
          {looksRow}
        </section>
        <section className="s2-iv-psec">{history}</section>
        <section className="s2-iv-psec s2-iv-psets">
          <div className="s2-iv-sec-h"><span className="s2-eyebrow"><Layers size={13} />{t("shop2.inv.setProgress")}</span></div>
          <SetBars list={progress} nameOf={(s) => setNameOf(s.key) || s2.setName(s)} hint={hint} onOpen={(k) => s2.openSet(k)} onHint={openHint} />
        </section>
        {legacy ? <section className="s2-iv-psec">{legacy}</section> : null}
        {pbar}
        {dialogs}
      </div>
    );
  }

  // ---- desktop / tablet ---------------------------------------------------------------
  const filled = INV_SLOTS.filter((c) => effective[c] != null).length;
  return (
    <div className={`s2-iv${s2.width >= 1240 ? " is-wide" : s2.width >= 760 ? " is-split" : ""}`} ref={rootRef}>
      <header className="s2-iv-head">
        <div className="s2-iv-title">
          <h2>{t("shop2.inv.title")}</h2>
          {headChips}
        </div>
        <div className="s2-iv-acts">
          <div className="s2-iv-grp">
            <button type="button" className="s2-btn is-sm" onClick={shuffle}><Shuffle size={14} />{t("shop2.inv.random")}</button>
            <button type="button" className="s2-btn is-sm" onClick={goHistory}><History size={14} />{t("shop2.inv.history")}</button>
            <button type="button" className="s2-btn is-sm" onClick={share}><Share2 size={14} />{t("shop2.inv.share")}</button>
          </div>
          {model.retired.length ? <button type="button" className="s2-btn is-sm is-quiet" onClick={goLegacy}><Archive size={14} />{t("shop2.inv.legacyN", { n: model.retired.length })}</button> : null}
        </div>
      </header>

      <div className="s2-iv-main">
        <div className="s2-iv-left">
          <section className="s2-iv-panel s2-iv-prev" ref={previewRef}>
            <div className="s2-iv-prev-top">
              <span className="s2-eyebrow"><Eye size={13} />{t("shop2.inv.preview")}</span>
              <div className="s2-iv-prev-ctl">
                <Seg size="sm" label={t("shop2.inv.preview")} value={mode} onChange={(v) => { setMode(v); setSplit(false); }} options={[{ id: "desktop", label: t("shop2.inv.desktop"), icon: Monitor }, { id: "phone", label: t("shop2.inv.phone"), icon: Smartphone }]} />
                <Seg size="sm" label={t("shop2.inv.diff")} value={split ? null : side} onChange={(v) => { setSide(v); setSplit(false); }} options={[{ id: "before", label: t("shop2.inv.before") }, { id: "after", label: t("shop2.inv.after") }]} />
                <button type="button" className={`s2-ibtn is-sm${split ? " is-plain is-on" : ""}`} aria-pressed={split} title={t("shop2.inv.compare")} aria-label={t("shop2.inv.compare")} onClick={() => setSplit((v) => !v)}><Split size={14} /></button>
              </div>
            </div>
            <PreviewStage before={before} after={after} mode={mode} side={side} split={split} changes={changes} itemFor={itemFor} withPhone={s2.width >= 1240 || s2.width < 760} />
            <Places user={shownUser} />
            <PaletteBar report={report} nameOf={s2.itemName} setNameOf={setNameOf} onFix={fixPalette} />
          </section>
          <section className="s2-iv-panel s2-iv-looks">
            <div className="s2-iv-sec-h">
              <span className="s2-eyebrow"><Bookmark size={13} />{t("shop2.inv.looks")}<span className="s2-count">{looks.length}</span></span>
              <div className="s2-iv-grp is-plain">
                <button type="button" className={`s2-btn is-sm is-quiet${pinnedFirst ? " is-active" : ""}`} aria-pressed={pinnedFirst} onClick={() => setPref({ invPinnedFirst: !pinnedFirst })}><Layers size={13} />{t("shop2.inv.pinnedFirst")}</button>
                <button type="button" className="s2-btn is-sm" onClick={() => setDialog({ kind: "save", items: currentLookToSave() })} title={t("shop2.inv.saveThis")}><Plus size={13} /><span className="s2-iv-long">{t("shop2.inv.saveThis")}</span><span className="s2-iv-short">{t("shop2.inv.saveShort")}</span></button>
              </div>
            </div>
            {looksRow}
          </section>
        </div>

        <section className="s2-iv-panel s2-iv-work">
          <aside className="s2-iv-rail">
            <div className="s2-iv-rail-h">
              <span className="s2-eyebrow">{t("shop2.inv.slots")}</span>
              <span className="s2-chip is-green">{t("shop2.inv.filled", { n: filled, total: INV_SLOTS.length })}</span>
            </div>
            {slots.map((c, i) => (
              <span key={c} className="s2-iv-slot-wrap">
                {i === INV_SLOTS.length ? <span className="s2-eyebrow s2-iv-rail-sub">{t("shop2.inv.other")}</span> : null}
                <SlotButton
                  category={c}
                  index={i < 9 ? i + 1 : null}
                  item={itemFor(effective[c], c)}
                  itemName={s2.itemName(itemFor(effective[c], c))}
                  count={(model.byCat[c] || []).length}
                  on={slot === c}
                  pending={c in pending}
                  fresh={(model.byCat[c] || []).some((e) => e.isNew)}
                  onClick={() => pickSlot(c)}
                />
              </span>
            ))}
            <div className="s2-iv-setp">
              <span className="s2-eyebrow"><Layers size={12} />{t("shop2.inv.setProgress")}</span>
              <SetBars list={progress} nameOf={(s) => setNameOf(s.key) || s2.setName(s)} hint={hint} onOpen={(k) => s2.openSet(k)} onHint={openHint} />
            </div>
            <div className="s2-iv-shuf">
              <div className="s2-iv-shuf-t"><Shuffle size={13} /><b>{t("shop2.inv.random")}</b></div>
              <p>{t("shop2.inv.shuffleBody")}</p>
              <LockChips locks={locks} onToggle={toggleLock} slots={INV_SLOTS} />
              <button type="button" className="s2-btn is-sm is-wide" onClick={shuffle}><Shuffle size={13} />{t("shop2.inv.shuffleGo")}</button>
            </div>
            <div className="s2-iv-rail-f"><span>{t("shop2.inv.keysHint")}</span><span><kbd>1</kbd>–<kbd>9</kbd></span></div>
          </aside>
          <div className="s2-iv-gridw">
            <div className="s2-iv-gh">
              <div>
                <h3>{t(`shop2.cat.${slot}`)}</h3>
                <p className="s2-muted">{sub} · {t("shop2.inv.subLive")}</p>
              </div>
              <Seg size="sm" label={t("shop2.inv.gridView")} value={view} onChange={(v) => setPref({ invView: v })} options={[{ id: "grid", icon: LayoutGrid, title: t("shop2.inv.gridView") }, { id: "list", icon: List, title: t("shop2.inv.listView") }]} />
            </div>
            <div className="s2-iv-fbar">
              {search}
              {sortMenu(false)}
              {setMenu}
            </div>
            <div className="s2-iv-chips">{chips}</div>
            {grid}
            {legacy}
            {history}
          </div>
        </section>
      </div>
      {pbar}
      {dialogs}
    </div>
  );
}

/** Phone: sticky preview that collapses to a slim bar while scrolling the grid. */
const PhonePreview = forwardRef(function PhonePreview({ user, mode, setMode, side, setSide, report, nameOf, setNameOf, onFix }, fwd) {
  const { t } = useLocale();
  const [collapsed, setCollapsed] = useState(false);
  const [manual, setManual] = useState(null);
  const sentinel = useRef(null);
  useLayoutEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const small = manual ?? collapsed;
  const banner = assetSrc(user?.equippedBanner) || null;
  const name = displayNameOf(user, t("shop2.preview.you"));
  const controls = (
    <div className="s2-iv-pp-ctl">
      <Seg size="sm" className="is-dark" label={t("shop2.inv.preview")} value={mode} onChange={setMode} options={[{ id: "desktop", icon: Monitor, title: t("shop2.inv.desktop") }, { id: "phone", icon: Smartphone, title: t("shop2.inv.phone") }]} />
      <Seg size="sm" className="is-dark" label={t("shop2.inv.diff")} value={side} onChange={setSide} options={[{ id: "before", label: t("shop2.inv.before") }, { id: "after", label: t("shop2.inv.after") }]} />
    </div>
  );
  return (
    <>
      <div ref={sentinel} className="s2-iv-pp-sentinel" aria-hidden="true" />
      <section className={`s2-iv-pp${small ? " is-small" : ""}`} ref={fwd} aria-label={t("shop2.inv.preview")}>
        {small ? (
          <div className="s2-iv-pp-bar">
            <S2Avatar user={user} size={34} />
            <span className="s2-iv-pp-bar-n"><S2Name user={user}>{name}</S2Name></span>
            {report ? <PaletteRing value={report.score} size={30} /> : null}
            <Seg size="sm" className="is-dark" label={t("shop2.inv.diff")} value={side} onChange={setSide} options={[{ id: "before", label: t("shop2.inv.before") }, { id: "after", label: t("shop2.inv.after") }]} />
          </div>
        ) : mode === "desktop" ? (
          <div className="s2-iv-pp-desk">
            {controls}
            <S2ProfileCard user={user} compact about={false} />
          </div>
        ) : (
          <>
            <div className="s2-iv-pp-ban" style={banner ? { backgroundImage: cssUrl(banner) } : undefined}>{controls}</div>
            <div className="s2-iv-pp-body">
              <div className="s2-iv-pp-avrow">
                <S2Avatar user={user} size={82} status="online" />
                <div className="s2-iv-pp-id">
                  <S2Name user={user}>{name}</S2Name>
                  <small>@{String(user?.username || "descall").toLowerCase()} · {t("shop2.preview.online")}</small>
                </div>
              </div>
              <div className="s2-iv-pp-ctx"><S2ChatMessage user={user} text={t("shop2.inv.chatLine")} time={new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} /></div>
            </div>
          </>
        )}
        {!small ? <div className="s2-iv-pp-harm"><PaletteBar compact report={report} nameOf={nameOf} setNameOf={setNameOf} onFix={onFix} /></div> : null}
        <button type="button" className="s2-iv-pp-grab" onClick={() => setManual(!small)} aria-label={t(small ? "shop2.inv.expand" : "shop2.inv.collapse")}><i /></button>
      </section>
    </>
  );
});

export function Shop2Wishlist() {
  const { t } = useLocale();
  const s2 = useS2();
  const slots = s2.data.storefront?.slots || [];
  const list = s2.data.wishlist;
  if (!list.length) {
    return (
      <div className="s2-empty">
        <Heart size={28} />
        <h3>{t("shop2.wishlist.emptyTitle")}</h3>
        <p>{t("shop2.wishlist.emptyBody")}</p>
      </div>
    );
  }
  const ownedIds = new Set([...s2.owned].map(String));
  return (
    <div className="s2-wish">
      <div className="s2-sech">
        <h2>{t("shop2.wishlist.title")}</h2>
        <Chip icon={Bell}>{t("shop2.wishlist.notify")}</Chip>
      </div>
      <div className="s2-wish-grid">
        {list.map((it) => {
          const slot = slots.find((s) => sameId(s.item.id, it.id));
          // sameId rule: the owned set can hold numbers while wishlist ids are strings.
          const owned = ownedIds.has(String(it.id));
          return (
            <div key={it.id} className={`s2-wish-card${slot ? " is-match" : ""}`}>
              <div className="s2-wish-art"><Shop2Art item={it} size="card" me={s2.me} sample={s2.me?.displayName} /></div>
              <div className="s2-wish-body">
                {slot ? <Chip tone="green">{t("shop2.wishlist.inToday")}</Chip> : <Chip>{t("shop2.wishlist.waiting")}</Chip>}
                <b>{s2.itemName(it)}</b>
                <small>{t(`shop2.cat.${it.category}`)} · {t(`shop2.rarity.${rarityOf(it)}`)}</small>
                <div className="s2-row">
                  {owned ? <Chip tone="green">{t("shop2.common.owned")}</Chip> : <Price value={slot?.price ?? it.price_descoin} />}
                  <span className="s2-row-r">
                    {slot && !owned ? <button type="button" className="s2-ibtn is-sm" onClick={() => s2.addToCart(it, slot.price)} aria-label={t("shop2.cart.add")}><Cart size={15} /></button> : null}
                    <button type="button" className="s2-ibtn is-sm" onClick={() => s2.openGift({ item: it, price: slot?.price ?? it.price_descoin })} aria-label={t("shop2.gifts.giftIt")}><Gift size={15} /></button>
                    <button type="button" className="s2-ibtn is-sm is-on" onClick={() => s2.actions.toggleWishlist(it, false)} aria-label={t("shop2.wishlist.remove")}><Heart size={15} weight="fill" /></button>
                  </span>
                </div>
                {slot && !owned ? <button type="button" className="s2-btn is-primary is-sm is-wide" onClick={() => s2.openCheckout({ kind: "item", item: it, price: slot.price })}>{t("shop2.card.buy")}</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
