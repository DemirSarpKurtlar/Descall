/**
 * Set oluşturucu (Draft A frame A2 + Draft B frame B2):
 *   left     Setler list (A2) or the piece rack (B2: palette score, drag into a slot)
 *   middle   name (32), theme palette + "Uyanları öner", 8 pieces in 4 groups (owner share
 *            on every piece, ownership warning), price: sum / dearest single item, set
 *            price + suggestion, discount slider with the 20–30 band (springs back),
 *            price ladder, vertical ruler, A/B price test; schedule and stock (piece sale,
 *            giftable, start, duration, stock, per person, gifts per day) with a two-week
 *            clash strip, "shift to" / "keep"; pre-publish checklist
 *   right    live preview desktop + phone for a sample user, who pays what, forecast,
 *            lifecycle states (SetPreview.jsx)
 *   header   shareable preview link, duplicate, save to the calendar, publish (10 s undo)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { stepUpHeaders } from "../../../lib/adminStepUp";
import { AlertTriangle, ArrowLeft, Calendar, Check, Clock, Copy, Link2, MagicWand, Plus, RotateCcw, Ruler, Search, Send, TestTube, Undo2, X } from "./icons.js";
import { normSet, shop2Api } from "./adminShop2Api.js";
import PieceRack from "./PieceRack.jsx";
import SetPreview from "./SetPreview.jsx";
import { Coin, Dialog, Pill, RarityPill, Seg, SetMark, Skel, Switch, Thumb, useFmt, useItemName, fdt } from "./ui.jsx";
import {
  DISCOUNT_BAND,
  SET_SLOTS,
  SLOT_GROUPS,
  STATUS_TONE,
  addDays,
  checklist,
  clamp,
  dayPos,
  dayRange,
  forecast,
  istDay,
  istMidnight,
  launchClash,
  lifecycle,
  moveToDay,
  priceAtDiscount,
  setBars,
  setPricing,
  springDiscount,
  suggestedPrice,
} from "./shop2Model.js";
import { statusText } from "./Dashboard.jsx";

const NAME_MAX = 32;
const DURATIONS = [1, 3, 5, 7, 10, 14, 0];
const IST = 3 * 3600000;
const toLocalInput = (iso) => (iso ? new Date(Date.parse(iso) + IST).toISOString().slice(0, 16) : "");
const fromLocalInput = (v) => (v ? new Date(Date.parse(`${v}:00.000Z`) - IST).toISOString() : null);

function blankSet(now) {
  const start = moveToDay(new Date(istMidnight(istDay(now)) + 20 * 3600000).toISOString(), addDays(istDay(now), 3));
  return {
    key: null,
    name: "",
    status: "draft",
    palette: ["#ff8a3d", "#ff3d6e", "#2a0d14", "#ffd27a"],
    pieces: {},
    price: 0,
    stock: { total: 300, left: 300 },
    partialSale: true,
    giftable: true,
    startsAt: start,
    endsAt: new Date(Date.parse(start) + 7 * 86400000).toISOString(),
    translations: { ready: 0, total: 7 },
    ownerShares: {},
    abTest: null,
  };
}

export function bodyOf(s) {
  return {
    key: s.key || null,
    nameI18n: s.nameI18n || null,
    abTestId: s.abTest?.id || null,
    name: s.name,
    palette: s.palette,
    pieces: Object.fromEntries(SET_SLOTS.filter((k) => s.pieces?.[k]).map((k) => [k, s.pieces[k].id])),
    price: s.price,
    stock: { total: s.stock?.total ?? null },
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    abTest: s.abTest,
  };
}

export default function SetBuilder({ setKey, sets, now, onBack, onOpenSet, onSaved, notify, fail, onRecall }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const name = useItemName();
  const [set, setSet] = useState(() => (setKey ? null : blankSet(Date.now())));
  const [savedBody, setSavedBody] = useState(() => (setKey ? null : JSON.stringify(bodyOf(blankSet(Date.now())))));
  const [savedAt, setSavedAt] = useState(null);
  const [left, setLeft] = useState(setKey ? "sets" : "rack");
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [chip, setChip] = useState("all");
  const [q, setQ] = useState("");
  const [setQuery, setSetQuery] = useState("");
  const [byPalette, setByPalette] = useState(true);
  const [targetSlot, setTargetSlot] = useState(null);
  const [rackPulse, setRackPulse] = useState(0);
  const [dropSlot, setDropSlot] = useState(null);
  const [stage, setStage] = useState("live");
  const [sample, setSample] = useState({ id: "few" });
  const [phoneSeen, setPhoneSeen] = useState(true);
  const [keepClash, setKeepClash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [undoUntil, setUndoUntil] = useState(null);
  const [spring, setSpring] = useState(0);
  const [sampleUsers, setSampleUsers] = useState([]);
  const saveTimer = useRef(null);

  /* ---------------- load ---------------- */

  useEffect(() => {
    if (!setKey) {
      const b = blankSet(Date.now());
      setSet(b);
      setSavedBody(JSON.stringify(bodyOf(b)));
      setLeft("rack");
      return;
    }
    setSet(null);
    shop2Api
      .set(setKey)
      .then((r) => {
        const s = r.set || normSet(r);
        setSet(s);
        setSavedBody(JSON.stringify(bodyOf(s)));
        setSavedAt(s.updatedAt || null);
        setSampleUsers(r.sampleUsers || []);
        setStage(["upcoming", "live", "last24", "soldout"].includes(lifecycle(s, Date.now())) ? lifecycle(s, Date.now()) : "live");
      })
      .catch((e) => {
        fail(e);
        onBack();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey]);

  const setKeyLoaded = set?.key || null;
  useEffect(() => {
    const palettes = Object.fromEntries((sets || []).map((x) => [x.key, x.palette]));
    shop2Api
      .catalog({ setKey: setKeyLoaded, palettes })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total || r.items.length);
      })
      .catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKeyLoaded]);

  const dirty = set && savedBody != null && JSON.stringify(bodyOf(set)) !== savedBody;

  /* ---------------- save ---------------- */

  const save = useCallback(
    async ({ quiet = false } = {}) => {
      if (!set) return null;
      const body = bodyOf(set);
      try {
        let key = set.key;
        if (key) await shop2Api.saveSet(key, body);
        else {
          const r = await shop2Api.createSet(body);
          key = r?.key;
          if (key) setSet((s) => ({ ...s, key }));
        }
        setSavedBody(JSON.stringify(body));
        setSavedAt(new Date().toISOString());
        if (!quiet) notify(t("adminShop2.toast.setSaved", { name: set.name || t("adminShop2.b.untitled") }));
        onSaved?.();
        return key;
      } catch (e) {
        if (!quiet) fail(e);
        return null;
      }
    },
    [set, notify, fail, onSaved, t]
  );

  // Autosave an existing set while a step-up token is valid (no code prompt mid-edit).
  useEffect(() => {
    if (!dirty || !set?.key) return undefined;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (Object.keys(stepUpHeaders() || {}).length) save({ quiet: true });
    }, 1500);
    return () => clearTimeout(saveTimer.current);
  }, [dirty, set, save]);

  /* ---------------- derived ---------------- */

  const pieces = useMemo(() => SET_SLOTS.map((k) => set?.pieces?.[k]).filter(Boolean), [set]);
  const pr = useMemo(() => setPricing(pieces, set?.price), [pieces, set]);
  const suggestion = suggestedPrice(pr.sum, set?.suggestPct ?? DISCOUNT_BAND.target);
  const others = useMemo(() => (sets || []).filter((s) => s.key !== set?.key), [sets, set]);
  const clash = useMemo(() => (set ? launchClash(set, others) : { with: [], suggest: null }), [set, others]);
  const check = useMemo(() => (set ? checklist(set, { clashes: keepClash ? [] : clash.with, phoneChecked: phoneSeen }) : null), [set, clash, keepClash, phoneSeen]);
  const fc = useMemo(() => {
    const sf = set?.serverForecast;
    if (sf && Number(sf.setSalesPerDay) > 0) {
      const mid = Number(sf.setSalesPerDay);
      const out = Date.parse(sf.stockOutAt || "");
      return { firstDayLo: Math.max(1, Math.floor(mid * 0.85)), firstDayHi: Math.max(1, Math.ceil(mid * 1.15)), soldOutDays: Number.isFinite(out) ? Math.max(1, Math.ceil((out - Date.now()) / 86400000)) : null };
    }
    return forecast({ stock: set?.stock?.total, discountPct: pr.discountPct });
  }, [set, pr]);
  // The most owned piece (owner counts from the server): who already has it pays less.
  const ownerWarn = useMemo(() => {
    const ranked = pieces.map((p) => ({ p, n: Number(set?.ownerShares?.[p.id] ?? p.owners ?? 0) })).sort((a, b) => b.n - a.n);
    const top = ranked[0];
    if (!top || top.n < 10) return null;
    const rest = ranked.slice(1).map((x) => x.n);
    const median = rest.length ? rest.sort((a, b) => a - b)[Math.floor(rest.length / 2)] : 0;
    if (top.n < Math.max(10, median * 1.5)) return null;
    const drop = Math.round((pr.price * (top.p.price_descoin || 0)) / Math.max(1, pr.sum) / 10) * 10;
    return { item: top.p, n: top.n, drop };
  }, [pieces, set, pr]);
  const st = set ? lifecycle(set, now) : "draft";
  const isLive = st === "live" || st === "last24";
  const durationDays = set?.endsAt && set?.startsAt ? Math.round((Date.parse(set.endsAt) - Date.parse(set.startsAt)) / 86400000) : 0;

  /* ---------------- editing ---------------- */

  const patch = (p) => setSet((s) => ({ ...s, ...p }));
  const place = (item, slot = item.category) => {
    if (!SET_SLOTS.includes(slot) || item.category !== slot) return;
    setSet((s) => ({ ...s, pieces: { ...s.pieces, [slot]: item } }));
    setTargetSlot(null);
    setChip("all");
  };
  const removePiece = (slot) => setSet((s) => {
    const p = { ...s.pieces };
    delete p[slot];
    return { ...s, pieces: p };
  });
  const pickSlot = (slot) => {
    setLeft("rack");
    setTargetSlot(slot);
    setChip(slot);
    setRackPulse(Date.now());
  };
  const suggestMatches = () => {
    setLeft("rack");
    setByPalette(true);
    setChip("all");
    setRackPulse(Date.now());
  };

  const publish = async () => {
    setBusy(true);
    try {
      const key = dirty || !set.key ? await save({ quiet: true }) : set.key;
      if (!key) throw new Error("save failed");
      const future = set.startsAt && Date.parse(set.startsAt) > Date.now();
      const r = await shop2Api.publishSet(key, { at: future ? set.startsAt : null });
      setPublishOpen(false);
      setSet((s) => ({ ...s, key, status: future ? "scheduled" : "live", state: future ? "scheduled" : "live" }));
      setUndoUntil(Date.parse(r?.undoUntil || "") || Date.now() + 10000);
      notify(t(future ? "adminShop2.toast.scheduled" : "adminShop2.toast.published", { name: set.name }));
      onSaved?.();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const undoPublish = async () => {
    try {
      await shop2Api.unpublishSet(set.key);
      setUndoUntil(null);
      setSet((s) => ({ ...s, status: "draft", state: "draft" }));
      notify(t("adminShop2.toast.unpublished"));
      onSaved?.();
    } catch (e) {
      fail(e);
    }
  };
  const undoLeftS = undoUntil ? Math.max(0, Math.ceil((undoUntil - now) / 1000)) : 0;
  useEffect(() => {
    if (undoUntil && undoLeftS <= 0) setUndoUntil(null);
  }, [undoUntil, undoLeftS]);

  // Shareable preview: a deep link other admins open on this set (Yönetici Paneli › Vitrin ve Setler).
  const copyLink = async () => {
    try {
      const key = set.key || (await save({ quiet: true }));
      if (!key) return;
      const url = `${window.location.origin}/admin/panel?tab=shop2&set=${encodeURIComponent(key)}`;
      try {
        await navigator.clipboard?.writeText(url);
      } catch {
        /* clipboard blocked */
      }
      notify(t("adminShop2.toast.linkCopied"));
    } catch (e) {
      fail(e);
    }
  };
  const duplicate = async () => {
    try {
      const r = await shop2Api.duplicateSet(set);
      const nk = r?.key;
      notify(t("adminShop2.toast.duplicated"));
      if (nk) onOpenSet(nk);
    } catch (e) {
      fail(e);
    }
  };

  if (!set) {
    return (
      <div className="as2-b">
        <Skel h={40} w="40%" />
        <div className="as2-b-grid">
          <Skel h={520} r={16} />
          <Skel h={520} r={16} />
          <Skel h={520} r={16} />
        </div>
      </div>
    );
  }

  const listSets = (sets || []).filter((s) => !setQuery.trim() || String(s.name).toLocaleLowerCase("tr-TR").includes(setQuery.trim().toLocaleLowerCase("tr-TR")));

  return (
    <div className="as2-b" data-testid="as2-builder">
      <header className="as2-hdr is-builder">
        <div className="as2-hdr-l">
          <div className="as2-crumb">
            <button type="button" className="as2-crumb-b" onClick={onBack} data-testid="as2-back">
              <ArrowLeft size={13} />
              {t("adminShop2.title")}
            </button>
            {" / "}
            {t("adminShop2.sets.title")}
          </div>
          <h1>
            {set.name || t("adminShop2.b.untitled")}
            <Pill tone={STATUS_TONE[st] || "gray"}>{statusText(t, set, st, locale, now)}</Pill>
            <small className="as2-saved">{dirty ? t("adminShop2.b.unsaved") : savedAt ? t("adminShop2.b.autosaved", { time: fdt(savedAt, locale, { hour: "2-digit", minute: "2-digit" }) }) : t("adminShop2.b.notSaved")}</small>
          </h1>
        </div>
        <div className="as2-hdr-r">
          <button type="button" className="as2-btn" onClick={copyLink} data-testid="as2-b-link">
            <Link2 size={15} />
            {t("adminShop2.b.previewLink")}
          </button>
          <button type="button" className="as2-btn" onClick={duplicate} disabled={!set.key && !pieces.length}>
            <Copy size={15} />
            {t("adminShop2.b.duplicate")}
          </button>
          <button type="button" className="as2-btn" onClick={() => save()} disabled={!dirty && Boolean(set.key)} data-testid="as2-b-save">
            <Calendar size={15} />
            {t("adminShop2.b.saveCal")}
          </button>
          {undoLeftS > 0 ? (
            <button type="button" className="as2-btn is-amber" onClick={undoPublish} data-testid="as2-b-undo-publish">
              <Undo2 size={15} />
              {t("adminShop2.b.undoPublish", { n: undoLeftS })}
            </button>
          ) : isLive ? (
            <button type="button" className="as2-btn is-danger" onClick={() => onRecall(set)}>
              <RotateCcw size={15} />
              {t("adminShop2.sets.recall")}
            </button>
          ) : (
            <button type="button" className="as2-btn is-p" onClick={() => setPublishOpen(true)} disabled={!check?.canPublish} data-testid="as2-b-publish">
              <Send size={15} />
              {t("adminShop2.b.publish")}
            </button>
          )}
        </div>
      </header>

      <div className="as2-b-grid">
        {/* ---------------- left ---------------- */}
        <aside className="as2-card as2-b-left">
          <Seg
            size="sm"
            value={left}
            onChange={setLeft}
            label={t("adminShop2.b.left")}
            options={[
              { id: "sets", label: t("adminShop2.sets.title") },
              { id: "rack", label: t("adminShop2.rack.title") },
            ]}
          />
          {left === "sets" ? (
            <div className="as2-slist">
              <div className="as2-slist-h">
                <label className="as2-search is-wide">
                  <Search size={15} />
                  <input value={setQuery} onChange={(e) => setSetQuery(e.target.value)} placeholder={t("adminShop2.b.searchSets")} aria-label={t("adminShop2.b.searchSets")} />
                </label>
                <button type="button" className="as2-btn is-p is-sm" onClick={() => onOpenSet(null)}>
                  <Plus size={14} />
                  {t("adminShop2.b.new")}
                </button>
              </div>
              {listSets.map((s) => {
                const ls = lifecycle(s, now);
                return (
                  <button key={s.key} type="button" className={`as2-sli${s.key === set.key ? " is-on" : ""}`} onClick={() => onOpenSet(s.key)}>
                    <SetMark set={s} size={40} />
                    <span>
                      <b>{s.name}</b>
                      <Pill tone={STATUS_TONE[ls] || "gray"}>{statusText(t, s, ls, locale, now)}</Pill>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <PieceRack
              items={items}
              total={total}
              loading={!items}
              chip={chip}
              onChip={(c) => {
                setChip(c);
                setTargetSlot(c === "all" ? null : c);
              }}
              q={q}
              onQ={setQ}
              byPalette={byPalette}
              onByPalette={setByPalette}
              palette={set.palette}
              setKey={set.key}
              pieces={set.pieces}
              onPlace={place}
              targetSlot={targetSlot}
              pulse={rackPulse}
            />
          )}
        </aside>

        {/* ---------------- middle ---------------- */}
        <section className="as2-card as2-b-form">
          <div className="as2-b-row2">
            <label className="as2-field">
              <span className="as2-cap">{t("adminShop2.b.name")}</span>
              <span className="as2-input">
                <input value={set.name} maxLength={NAME_MAX} onChange={(e) => patch({ name: e.target.value })} placeholder={t("adminShop2.b.namePh")} data-testid="as2-b-name" />
                <em className="tnum">
                  {set.name.length} / {NAME_MAX}
                </em>
              </span>
            </label>
            <div className="as2-field">
              <span className="as2-cap">{t("adminShop2.b.palette")}</span>
              <span className="as2-pal">
                {set.palette.map((c, i) => (
                  <label key={i} className="as2-sw-c" style={{ background: c }} title={c}>
                    <input type="color" value={c} onChange={(e) => patch({ palette: set.palette.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={t("adminShop2.b.paletteN", { n: i + 1 })} />
                  </label>
                ))}
                <button type="button" className="as2-btn is-sm" onClick={suggestMatches} data-testid="as2-b-suggest">
                  <MagicWand size={14} />
                  {t("adminShop2.b.suggest")}
                </button>
              </span>
            </div>
          </div>

          <div className="as2-b-sh">
            <span className="as2-cap">{t("adminShop2.b.pieces", { n: pieces.length, total: SET_SLOTS.length })}</span>
            <span className="as2-muted">{t("adminShop2.b.piecesHint")}</span>
          </div>
          <div className="as2-groups">
            {SLOT_GROUPS.map(([g, slots]) => (
              <div key={g} className="as2-group">
                <span className="as2-cap is-sub">{t(`adminShop2.b.group.${g}`)}</span>
                {slots.map((slot) => {
                  const p = set.pieces?.[slot];
                  const share = p ? Number(set.ownerShares?.[p.id] ?? p.owners ?? 0) : 0;
                  return (
                    <div
                      key={slot}
                      className={`as2-slot${p ? "" : " is-empty"}${targetSlot === slot ? " is-target" : ""}${dropSlot === slot ? " is-drop" : ""}${ownerWarn?.item?.id === p?.id ? " is-warn" : ""}`}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes("text/x-as2-item")) {
                          e.preventDefault();
                          setDropSlot(slot);
                        }
                      }}
                      onDragLeave={() => setDropSlot(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropSlot(null);
                        const id = e.dataTransfer.getData("text/x-as2-item");
                        const it = (items || []).find((x) => String(x.id) === id);
                        if (it && it.category === slot) place(it, slot);
                        else if (it) notify(t("adminShop2.b.wrongSlot", { slot: t(`adminShop2.catShort.${slot}`) }), { tone: "warn" });
                      }}
                      data-testid={`as2-slot-${slot}`}
                    >
                      <button type="button" className="as2-slot-b" onClick={() => pickSlot(slot)}>
                        {p ? (
                          <>
                            <Thumb item={p} size={36} />
                            <span className="as2-slot-t">
                              <b>{name(p)}</b>
                              <small>
                                {t(`adminShop2.cat.${slot}`)}
                                {share ? ` · ${t("adminShop2.b.ownedBy", { n: f.n(share) })}` : ""}
                              </small>
                            </span>
                            <span className="as2-slot-p">
                              <b className="tnum">{f.n(p.price_descoin)}</b>
                              <RarityPill rarity={p.rarity} />
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="as2-slot-plus">
                              <Plus size={16} />
                            </span>
                            <span className="as2-slot-t">
                              <b>{t(`adminShop2.cat.${slot}`)}</b>
                              <small>{t("adminShop2.b.dropHere")}</small>
                            </span>
                          </>
                        )}
                      </button>
                      {p ? (
                        <button type="button" className="as2-slot-x" onClick={() => removePiece(slot)} aria-label={t("adminShop2.b.remove")}>
                          <X size={12} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {ownerWarn ? (
            <p className="as2-warn" data-testid="as2-owner-warn">
              <AlertTriangle size={16} />
              <span>{t("adminShop2.b.ownerWarn", { name: name(ownerWarn.item), n: f.n(ownerWarn.n), drop: f.n(ownerWarn.drop) })}</span>
            </p>
          ) : null}

          <PriceBlock set={set} pr={pr} suggestion={suggestion} patch={patch} spring={spring} setSpring={setSpring} />

          <ScheduleBlock set={set} patch={patch} durationDays={durationDays} clash={clash} keepClash={keepClash} setKeepClash={setKeepClash} others={others} now={now} />

          <div className="as2-check" data-testid="as2-checklist">
            <div className="as2-b-sh">
              <span className="as2-cap">{t("adminShop2.b.check")}</span>
              <Pill tone={check.ready === check.total ? "green" : "amber"}>{t("adminShop2.b.checkN", { n: check.ready, total: check.total })}</Pill>
            </div>
            <ul>
              {check.rows.map((r) => (
                <li key={r.key} className={r.ok ? "is-ok" : r.warn ? "is-warn" : "is-no"}>
                  {r.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                  {t(`adminShop2.b.ck.${r.key}`, r.vars || {})}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- right ---------------- */}
        <section className="as2-card as2-b-right">
          <SetPreview set={set} now={now} stage={stage} onStage={setStage} sample={sample} onSample={setSample} users={sampleUsers} onPhoneSeen={() => setPhoneSeen(true)} forecast={fc} />
        </section>
      </div>

      <PublishDialog open={publishOpen} set={set} pr={pr} check={check} busy={busy} onClose={() => setPublishOpen(false)} onGo={publish} />
    </div>
  );
}

/* ------------------------------------------------------------------ price */

function PriceBlock({ set, pr, suggestion, patch, spring, setSpring }) {
  const { t } = useLocale();
  const f = useFmt();
  const [raw, setRaw] = useState(String(set.price || ""));
  useEffect(() => setRaw(String(set.price || "")), [set.price]);
  const disc = clamp(pr.discountPct, 0, 50);
  const sugPct = pr.sum ? Math.round((1 - suggestion / pr.sum) * 100) : DISCOUNT_BAND.target;
  const ab = set.abTest || null;
  const max = Math.max(1, pr.sum);
  const pos = (v) => `${clamp((v / max) * 100, 0, 100)}%`;
  const letGo = () => {
    if (!pr.sum) return;
    const s = springDiscount(pr.discountPct);
    if (s !== Math.round(pr.discountPct)) {
      setSpring(Date.now());
      patch({ price: priceAtDiscount(pr.sum, s) });
    }
  };
  return (
    <div className="as2-price" data-testid="as2-price">
      <div className="as2-b-sh">
        <span className="as2-cap">{t("adminShop2.b.price")}</span>
        <span className="as2-muted tnum">{t("adminShop2.b.priceFacts", { sum: f.n(pr.sum), max: f.n(pr.maxSingle) })}</span>
      </div>
      <div className="as2-price-grid">
        <div className="as2-price-main">
          <div className="as2-price-row">
            <label className="as2-pin">
              <i className="as2-coin-d" aria-hidden="true">
                D
              </i>
              <input
                className="tnum"
                inputMode="numeric"
                value={raw}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  setRaw(v);
                  patch({ price: Number(v || 0) });
                }}
                aria-label={t("adminShop2.b.setPrice")}
                data-testid="as2-b-price"
              />
              <em>{t("adminShop2.b.setPrice")}</em>
            </label>
            <span className="as2-sugg">
              <span className="as2-muted">{t("adminShop2.b.suggested")}</span>
              <b className="tnum">{t("adminShop2.b.suggestedV", { price: f.n(suggestion), pct: sugPct })}</b>
              <button type="button" className="as2-link" onClick={() => patch({ price: suggestion })} disabled={!pr.sum || suggestion === set.price}>
                {t("adminShop2.b.apply")}
              </button>
            </span>
          </div>
          <div className={`as2-disc${spring && Date.now() - spring < 700 ? " is-spring" : ""}`} key={spring}>
            <span className="as2-muted">{t("adminShop2.b.discount")}</span>
            <div className="as2-disc-track">
              <i className="as2-disc-band" style={{ left: `${(DISCOUNT_BAND.min / 50) * 100}%`, width: `${((DISCOUNT_BAND.max - DISCOUNT_BAND.min) / 50) * 100}%` }} />
              <input
                type="range" className="as2-range"
                min="0"
                max="50"
                step="1"
                value={Math.round(disc)}
                disabled={!pr.sum}
                onChange={(e) => patch({ price: priceAtDiscount(pr.sum, Number(e.target.value)) })}
                onPointerUp={letGo}
                onKeyUp={letGo}
                onBlur={letGo}
                style={{ "--fill": `${(disc / 50) * 100}%` }}
                aria-label={t("adminShop2.b.discount")}
                data-testid="as2-b-discount"
              />
              <span className="as2-disc-lbl tnum">
                <span>%0</span>
                <span className="is-band">{t("adminShop2.b.band", { a: DISCOUNT_BAND.min, b: DISCOUNT_BAND.max })}</span>
                <span>%50</span>
              </span>
            </div>
            <b className={`tnum ${pr.inBand ? "as2-pos" : "as2-amber"}`}>%{f.n(Math.round(pr.discountPct))}</b>
          </div>
          <div className="as2-ladder" aria-label={t("adminShop2.b.ladder")}>
            <div className="as2-ladder-bar">
              <i className="is-single" style={{ width: pos(pr.maxSingle) }} />
              <i className="is-set" style={{ left: pos(pr.maxSingle), width: `calc(${pos(pr.price)} - ${pos(pr.maxSingle)})` }} />
              <b className="as2-ladder-mk" style={{ left: pos(pr.price) }} />
              <b className="as2-ladder-mk is-end" style={{ left: "100%" }} />
            </div>
            <div className="as2-ladder-lbl tnum">
              <span className="is-single">{t("adminShop2.b.ladderSingle", { v: f.n(pr.maxSingle) })}</span>
              <span className="is-set">{t("adminShop2.b.ladderSet", { v: f.n(pr.price), x: f.n(pr.timesMax, { maximumFractionDigits: 1 }) })}</span>
              <span>{t("adminShop2.b.ladderSum", { v: f.n(pr.sum) })}</span>
            </div>
          </div>
          <div className="as2-ab">
            <label className="as2-tg">
              <Switch checked={Boolean(ab?.enabled)} onChange={(v) => patch({ abTest: v ? { enabled: true, priceB: ab?.priceB || priceAtDiscount(pr.sum, Math.min(DISCOUNT_BAND.max, Math.round(pr.discountPct) + 4)), hours: ab?.hours || 48 } : null })} label={t("adminShop2.b.ab")} testId="as2-b-ab" />
              <span>
                <TestTube size={14} /> {t("adminShop2.b.ab")}
              </span>
            </label>
            {ab?.enabled ? (
              <div className="as2-ab-body">
                <label className="as2-pin is-sm">
                  <span className="as2-muted">B</span>
                  <input className="tnum" inputMode="numeric" value={ab.priceB} onChange={(e) => patch({ abTest: { ...ab, priceB: Number(e.target.value.replace(/\D/g, "") || 0) } })} aria-label={t("adminShop2.b.abPrice")} />
                </label>
                <Seg size="sm" value={ab.hours} onChange={(h) => patch({ abTest: { ...ab, hours: h } })} label={t("adminShop2.b.abHours")} options={[24, 48, 72].map((h) => ({ id: h, label: t("adminShop2.unit.hoursN", { n: h }) }))} />
                <p className="as2-hint">{t("adminShop2.b.abNote", { a: f.n(set.price), b: f.n(ab.priceB), h: ab.hours })}</p>
              </div>
            ) : null}
          </div>
        </div>
        <Ruler2 pr={pr} suggestion={suggestion} onPick={(v) => patch({ price: v })} />
      </div>
    </div>
  );
}

/** Dikey fiyat cetveli (B2): band in green, the dearest single item, the suggestion, the price line (drag). */
function Ruler2({ pr, suggestion, onPick }) {
  const { t } = useLocale();
  const f = useFmt();
  const ref = useRef(null);
  const sum = Math.max(1, pr.sum);
  const y = (v) => `${100 - clamp((v / sum) * 100, 0, 100)}%`;
  const lo = priceAtDiscount(pr.sum, DISCOUNT_BAND.max);
  const hi = priceAtDiscount(pr.sum, DISCOUNT_BAND.min);
  const drag = (e) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !pr.sum) return;
    const move = (ev) => {
      const p = clamp(1 - (ev.clientY - r.top) / r.height, 0, 1);
      onPick(Math.round((p * pr.sum) / 10) * 10);
    };
    move(e);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = springDiscount(pr.sum ? (1 - (pr.price || 0) / pr.sum) * 100 : 0);
      onPick(priceAtDiscount(pr.sum, d));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="as2-ruler" aria-label={t("adminShop2.b.ruler")}>
      <span className="as2-ruler-cap">
        <Ruler size={13} />
        {t("adminShop2.b.ruler")}
      </span>
      <div className="as2-ruler-track" ref={ref} onPointerDown={drag}>
        <i className="as2-ruler-band" style={{ top: y(hi), bottom: `calc(100% - ${y(lo)})` }} />
        <i className="as2-ruler-single" style={{ top: y(pr.maxSingle) }} />
        <i className="as2-ruler-sugg" style={{ top: y(suggestion) }} />
        <i className="as2-ruler-price" style={{ top: y(pr.price) }} />
      </div>
      <div className="as2-ruler-lbl tnum">
        <span style={{ top: y(pr.sum) }}>{f.n(pr.sum)}</span>
        <span className="is-band" style={{ top: y(hi) }}>
          %{DISCOUNT_BAND.min} · {f.n(hi)}
        </span>
        <span className="is-band" style={{ top: y(lo) }}>
          %{DISCOUNT_BAND.max} · {f.n(lo)}
        </span>
        <span className="is-single" style={{ top: y(pr.maxSingle) }}>
          {t("adminShop2.b.rulerSingle", { v: f.n(pr.maxSingle) })}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ schedule */

function ScheduleBlock({ set, patch, durationDays, clash, keepClash, setKeepClash, others, now }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const unlimitedStock = set.stock?.total == null;
  const setStart = (iso) => {
    const dur = durationDays || 0;
    patch({ startsAt: iso, endsAt: dur ? new Date(Date.parse(iso) + dur * 86400000).toISOString() : null });
  };
  // Two-week strip from two days before the start.
  const from = set.startsAt ? addDays(istDay(Date.parse(set.startsAt)), -2) : istDay(now);
  const days = 12;
  const strip = setBars([...others.filter((s) => s.status !== "draft"), { ...set, key: "__this", status: "scheduled" }], from, days, now);
  return (
    <div className="as2-sched-b" data-testid="as2-schedule">
      <div className="as2-b-sh">
        <span className="as2-cap">{t("adminShop2.b.schedule")}</span>
        <span className="as2-tg is-inline is-ro" title={t("adminShop2.b.partialHint")}>
          <Switch checked disabled label={t("adminShop2.b.partial")} />
          <span>{t("adminShop2.b.partial")}</span>
        </span>
        <span className="as2-tg is-inline is-ro" title={t("adminShop2.b.giftableHint")}>
          <Switch checked disabled label={t("adminShop2.b.giftable")} />
          <span>{t("adminShop2.b.giftable")}</span>
        </span>
      </div>
      <div className="as2-sched-fields">
        <label className="as2-fbox">
          <Calendar size={14} />
          <input type="datetime-local" value={toLocalInput(set.startsAt)} onChange={(e) => setStart(fromLocalInput(e.target.value))} aria-label={t("adminShop2.b.start")} data-testid="as2-b-start" />
        </label>
        <label className="as2-fbox">
          <Clock size={14} />
          <select value={durationDays} onChange={(e) => {
            const d = Number(e.target.value);
            patch({ endsAt: d ? new Date(Date.parse(set.startsAt || new Date(now).toISOString()) + d * 86400000).toISOString() : null });
          }} aria-label={t("adminShop2.b.duration")}>
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d ? t("adminShop2.unit.daysN", { n: d }) : t("adminShop2.b.noEnd")}
              </option>
            ))}
          </select>
        </label>
        <label className="as2-fbox">
          <span className="as2-muted">{t("adminShop2.b.stock")}</span>
          <input
            className="tnum"
            inputMode="numeric"
            value={unlimitedStock ? "" : set.stock.total}
            placeholder={t("adminShop2.sets.unlimited")}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              patch({ stock: v === "" ? { total: null, left: null } : { total: Number(v), left: Number(v) } });
            }}
            aria-label={t("adminShop2.b.stock")}
          />
        </label>
      </div>
      <div className="as2-mstrip" style={{ "--days": days }}>
        <div className="as2-mstrip-days tnum">
          {dayRange(from, days).map((d) => (
            <span key={d}>{Number(d.slice(8))}</span>
          ))}
        </div>
        <div className="as2-mstrip-bars" style={{ "--lanes": Math.max(1, ...strip.map((b) => b.lane + 1)) }}>
          {strip.map((b) => (
            <i
              key={b.set.key}
              className={`${b.set.key === "__this" ? "is-this" : ""}${clash.with.some((c) => c.key === b.set.key) && !keepClash ? " is-clash" : ""}`}
              style={{ left: `${(b.x0 / days) * 100}%`, width: `${((b.x1 - b.x0) / days) * 100}%`, top: `${b.lane * 9}px`, "--p2": b.set.palette?.[2] || "#7a8fff" }}
              title={b.set.key === "__this" ? set.name : b.set.name}
            />
          ))}
          {set.startsAt ? <b className="as2-mstrip-start" style={{ left: `${((dayPos(set.startsAt, from) ?? 0) / days) * 100}%` }} /> : null}
        </div>
      </div>
      {clash.with.length && !keepClash ? (
        <div className="as2-warn is-clash" data-testid="as2-clash-warn">
          <AlertTriangle size={16} />
          <span>
            {t("adminShop2.b.clash", { names: clash.with.map((s) => s.name).join(t("adminShop2.and")) })}
            {clash.suggest ? ` ${t("adminShop2.b.clashSuggest", { day: fdt(new Date(istMidnight(clash.suggest) + 3600000).toISOString(), locale, { day: "numeric", month: "short" }) })}` : ""}
          </span>
          <span className="as2-warn-acts">
            {clash.suggest ? (
              <button type="button" className="as2-btn is-sm" onClick={() => setStart(moveToDay(set.startsAt, clash.suggest))} data-testid="as2-clash-shift">
                {t("adminShop2.b.shiftTo", { day: fdt(new Date(istMidnight(clash.suggest) + 3600000).toISOString(), locale, { day: "numeric", month: "short" }) })}
              </button>
            ) : null}
            <button type="button" className="as2-btn is-sm" onClick={() => setKeepClash(true)}>
              {t("adminShop2.b.keep")}
            </button>
          </span>
        </div>
      ) : null}
      {set.stock?.total != null ? <p className="as2-hint tnum">{t("adminShop2.b.stockNote", { n: f.n(set.stock.total), sold: f.n(set.stockSold || 0) })}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ publish */

function PublishDialog({ open, set, pr, check, busy, onClose, onGo }) {
  const { t, locale } = useLocale();
  const f = useFmt();
  const future = set?.startsAt && Date.parse(set.startsAt) > Date.now();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      icon={Send}
      title={t(future ? "adminShop2.pub.titleAt" : "adminShop2.pub.title", { name: set?.name || "" })}
      subtitle={future ? t("adminShop2.pub.subAt", { when: fdt(set.startsAt, locale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) }) : t("adminShop2.pub.sub")}
      width={560}
      testId="as2-publish-dialog"
      footer={
        <>
          <button type="button" className="as2-btn" onClick={onClose} disabled={busy}>
            {t("adminShop2.cancel")}
          </button>
          <button type="button" className="as2-btn is-p" onClick={onGo} disabled={busy} data-testid="as2-publish-confirm">
            <Send size={15} />
            {busy ? t("adminShop2.saving") : t(future ? "adminShop2.pub.goAt" : "adminShop2.pub.go")}
          </button>
        </>
      }
    >
      <div className="as2-pub">
        <SetMark set={set} size={64} />
        <dl>
          <dt>{t("adminShop2.b.setPrice")}</dt>
          <dd>
            <Coin value={pr.price} strike={pr.sum} />
          </dd>
          <dt>{t("adminShop2.b.discount")}</dt>
          <dd className="tnum">%{f.n(Math.round(pr.discountPct))}</dd>
          <dt>{t("adminShop2.b.stock")}</dt>
          <dd className="tnum">{set?.stock?.total == null ? t("adminShop2.sets.unlimited") : f.n(set.stock.total)}</dd>
        </dl>
      </div>
      <ul className="as2-pub-ck">
        {check?.rows.map((r) => (
          <li key={r.key} className={r.ok ? "is-ok" : "is-warn"}>
            {r.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
            {t(`adminShop2.b.ck.${r.key}`, r.vars || {})}
          </li>
        ))}
      </ul>
      <p className="as2-hint is-blue">{t("adminShop2.pub.undo")}</p>
    </Dialog>
  );
}
