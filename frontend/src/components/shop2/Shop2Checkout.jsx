// Checkout + celebration (sets drafts A "Onay ve kutlama" and C "Basılı tutarak onay"):
// confirm with owned rows deducted, "wear everything now" and title options, hold-to-confirm
// against wrong taps, then the window turns into the celebration in place: rays and 40
// particles in the set colours, before / after, the 8 slots ticking in, "Hepsini kuşan",
// pick pieces one by one, show friends, save the look, see it on the stage, and the
// 10-minute refund countdown. The previous look is saved automatically for undo.
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../../context/LocaleContext";
import { formatNumber } from "../../i18n/format.js";
import {
  celebrationParticles,
  composeTryOnUser,
  currentLook,
  mmss,
  setPricing,
  SHOP2_REFUND_MS,
  windowLeft,
} from "../../lib/shop2Logic.js";
import { useS2 } from "./Shop2Context.js";
import { Chip, CloseX, HoldButton, Layer, Num, Price, ShortBy, useNow, useReducedMotion } from "./Shop2Bits.jsx";
import Shop2Art from "./Shop2Art.jsx";
import GlassCheckbox from "../ui/GlassCheckbox";
import { restoreLook } from "./Shop2Sets.jsx";
import { S2ChatMessage, S2ProfileCard, S2VoiceTile } from "./Shop2Preview.jsx";
import { Bookmark, Check, ChevronRight, Crown, Share2, Shirt, SlidersHorizontal, Store, Undo2 } from "./shop2Icons.jsx";

const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const purchaseIdOf = (res) => res?.purchase?.id ?? res?.purchaseId ?? res?.purchase_id ?? null;
const refundUntilOf = (res) => res?.refundableUntil ?? res?.purchase?.refundUntil ?? res?.refundUntil ?? null;

function Confirm({ c, set, pricing, items, total, onPaid, onClose }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const [equipNow, setEquipNow] = useState(c.kind !== "cart");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const after = s2.balance - total;
  const completes = set && pricing && (!c.pieceIds || c.pieceIds.length >= pricing.missingCount);
  // Chosen pieces only: the ladder shows their single prices minus the set rate while the
  // 7-day partial price is open (a "set price" line would not add up to what is charged).
  const pay = async (holdToken) => {
    setBusy(true);
    setErr("");
    try {
      let res;
      if (c.kind === "set") res = await s2.actions.buySet(c.setKey, { pieceIds: c.pieceIds, holdToken, expectedPrice: total });
      else if (c.kind === "night") res = await s2.actions.buyNight(c.card.index, { holdToken, price: total });
      else if (c.kind === "cart") {
        const results = [];
        for (const x of items) {
          // eslint-disable-next-line no-await-in-loop
          // A night market card in the cart is bought at its revealed discount, not as an item.
          results.push(x.nightCardIndex != null
            ? await s2.actions.buyNight(x.nightCardIndex, { holdToken: `${holdToken}-n${x.nightCardIndex}`, price: x.price })
            : await s2.actions.buyItem(x.item, { holdToken: `${holdToken}-${x.item.id}`, price: x.price, source: "cart" }));
        }
        res = results[results.length - 1];
        s2.clearCart();
      } else res = await s2.actions.buyItem(c.item, { holdToken, price: c.price, source: c.setKey ? "set_piece" : "storefront" });
      onPaid(res, { equipNow });
    } catch (e) {
      setErr(e?.message || t("shop2.errors.buy"));
      setBusy(false);
    }
  };
  const heading = c.kind === "set" ? t("shop2.checkout.setTitle", { name: s2.setName(set) }) : c.kind === "cart" ? t("shop2.checkout.cartTitle", { n: items.length }) : t("shop2.checkout.itemTitle", { name: s2.itemName(c.item) });
  const sub = c.kind === "set"
    ? t("shop2.checkout.setSub", { n: c.pieceIds ? c.pieceIds.length : pricing.missingCount, owned: pricing.ownedCount })
    : c.kind === "night" ? t("shop2.checkout.nightSub") : c.kind === "cart" ? t("shop2.checkout.cartSub") : t(`shop2.cat.${c.item.category}`);
  const rows = c.kind === "set" ? set.pieces : items.map((x) => ({ item: x.item, owned: false, price: x.price }));
  return (
    <div className="s2-co">
      <div className="s2-co-head">
        <span className="s2-co-art" style={set ? { background: `linear-gradient(135deg, ${set.palette?.[0] || "#111"}, ${set.palette?.[2] || "#587af5"})` } : undefined}>
          {c.kind !== "set" && rows[0] ? <Shop2Art item={rows[0].item} size="tile" me={s2.me} /> : null}
        </span>
        <span><h3>{heading}</h3><small className="s2-muted">{sub}</small></span>
        <CloseX onClick={onClose} label={t("shop2.common.close")} />
      </div>
      {c.kind === "set" && s2.layout !== "phone" ? (
        <div className="s2-co-slots">
          {set.pieces.map((p) => <span key={p.item.id} className={`s2-slot is-sm${p.owned ? " is-owned" : ""}`}><Shop2Art item={p.item} size="slot" me={s2.me} fit /></span>)}
        </div>
      ) : null}
      <div className="s2-co-rows">
        {rows.map((p) => {
          const chosen = !c.pieceIds || c.pieceIds.map(String).includes(String(p.item.id));
          if (c.kind === "set" && !chosen && !p.owned) return null;
          return (
            <div key={p.item.id} className={`s2-co-row${p.owned ? " is-owned" : ""}`}>
              <Shop2Art item={p.item} size="chip" me={s2.me} />
              <b>{s2.itemName(p.item)}</b>
              <small>{t(`shop2.cat.${p.item.category}`)}</small>
              {p.owned ? <span className="s2-ok"><Check size={13} />{t("shop2.checkout.ownedDeducted")}</span> : <span className="s2-num">{formatNumber(p.price ?? p.item.price_descoin, locale)} {t("shop2.common.d")}</span>}
            </div>
          );
        })}
      </div>
      <div className="s2-ladder is-box">
        {c.kind === "set" && !completes ? (
          <>
            <span>{t("shop2.buy.sum")}</span><b className="s2-num"><Num value={pricing.selectedSingles} /> {t("shop2.common.d")}</b>
            {total < pricing.selectedSingles ? <><span>{t("shop2.buy.setDiscount", { n: pricing.discountPct })}</span><b className="s2-num is-green">-<Num value={pricing.selectedSingles - total} /> {t("shop2.common.d")}</b></> : null}
          </>
        ) : c.kind === "set" ? (
          <>
            <span>{t("shop2.checkout.setPrice")}</span><b className="s2-num"><Num value={pricing.setPrice} /> {t("shop2.common.d")}</b>
            {pricing.ownedDeduction ? <><span>{t("shop2.checkout.ownedLine", { n: pricing.ownedCount })}</span><b className="s2-num is-green">-<Num value={pricing.ownedDeduction} /> {t("shop2.common.d")}</b></> : null}
          </>
        ) : c.kind === "night" && c.card?.basePrice > total ? (
          <><span>{t("shop2.checkout.nightDiscount", { n: c.card.discountPct })}</span><b className="s2-num is-green">-<Num value={c.card.basePrice - total} /> {t("shop2.common.d")}</b></>
        ) : null}
        <span className="is-strong">{t("shop2.checkout.toPay")}</span><b className="s2-num is-big"><Num value={total} /> {t("shop2.common.d")}</b>
        <span>{t("shop2.checkout.balance")}</span><b className="s2-num">{after < 0 ? <><Num value={s2.balance} /> {t("shop2.common.d")}</> : <><span className="s2-dim"><Num value={s2.balance} /> {"→"} </span><Num value={after} /> {t("shop2.common.d")}</>}</b>
      </div>
      {c.kind !== "cart" ? (
        <label className="s2-check"><GlassCheckbox checked={equipNow} onChange={(e) => setEquipNow(e.target.checked)} /><span>{c.kind === "set" ? t("shop2.checkout.equipAll") : t("shop2.checkout.equipNow")}</span></label>
      ) : null}
      {completes ? (
        <p className="s2-note is-gold"><Crown size={14} />{t("shop2.checkout.titleNote", { title: set.reward?.title ? s2.itemName({ name: set.reward.title }) : t("shop2.sets.rewardDefault", { name: s2.setName(set) }) })}</p>
      ) : null}
      {err ? <p className="s2-err" role="alert">{err}</p> : null}
      {after < 0 ? (
        <ShortBy n={-after} />
      ) : (
        <HoldButton onConfirm={pay} busy={busy} className="is-wide is-set" hint={t("shop2.checkout.holdHint")}>
          {t("shop2.checkout.hold", { n: formatNumber(total, locale) })}
        </HoldButton>
      )}
      <div className="s2-row">
        <button type="button" className="s2-btn is-flex" onClick={onClose}>{t("shop2.common.cancel")}</button>
      </div>
      <p className="s2-note is-center"><Undo2 size={14} />{t("shop2.checkout.refundNote", { m: SHOP2_REFUND_MS / 60000 })}</p>
    </div>
  );
}

const CELE_CHAT = new Set(["chat_bubble"]);
const CELE_VOICE = new Set(["voice_tile", "join_sound"]);
const CELE_ART = new Set(["typing_flare", "reaction_burst", "call_overlay", "theme"]);

function celeSurfaceOf(item) {
  const c = item?.category;
  if (CELE_CHAT.has(c)) return "chat";
  if (CELE_VOICE.has(c)) return "voice";
  if (CELE_ART.has(c)) return "art";
  return "profile";
}

/** Before / after face of the celebration: the surface where the bought item shows. */
function CeleSurface({ kind, user, item, after = false }) {
  const { t } = useLocale();
  if (kind === "chat") {
    return (
      <div className="s2-cele-surface">
        <S2ChatMessage user={user} text={t("shop2.celebrate.chatLine")} />
      </div>
    );
  }
  if (kind === "voice") {
    return (
      <div className="s2-cele-surface is-voice">
        <S2VoiceTile user={user} size="sm" joined={after && item?.category === "join_sound" ? { who: t("shop2.sample.joinedShort"), sound: "" } : null} />
      </div>
    );
  }
  if (kind === "art") {
    // The item's own renderer after, the plain sample before.
    return (
      <div className="s2-cele-surface is-art">
        {after ? <Shop2Art item={item} size="card" me={user} sample={user?.displayName} /> : <S2ChatMessage user={user} text={t("shop2.celebrate.chatLine")} />}
      </div>
    );
  }
  return <S2ProfileCard user={user} compact about={false} />;
}

function Celebrate({ c, set, pricing, items, total, result, autoEquip, onClose }) {
  const { t, locale } = useLocale();
  const s2 = useS2();
  const reduce = useReducedMotion();
  const now = useNow(true);
  const [paidAt] = useState(() => Date.now());
  // The look before this purchase, frozen: once the new pieces are worn s2.me already shows
  // them, and the before / after cards and the undo must still show and restore the old look.
  const [before] = useState(() => s2.me);
  const newIds = new Set(items.map((x) => String(x.item.id)));
  // "Hepsini kuşan" on a set wears every piece of it the user owns now (pieces bought earlier
  // too), the same look the after card shows; a single item wears just that item.
  const wearItems = set ? set.pieces.filter((p) => p.owned || newIds.has(String(p.item.id))).map((p) => p.item) : items.map((x) => x.item);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState(() => new Set(wearItems.map((it) => String(it.id))));
  const [equipping, setEquipping] = useState(false);
  const [worn, setWorn] = useState(false);
  const [prevSaved, setPrevSaved] = useState(null);
  const [refunded, setRefunded] = useState(false);
  const palette = set?.palette || ["#587af5", "#a9b9ff", "#ffd76a", "#2fbf8a"];
  const parts = useMemo(() => celebrationParticles(palette, 40, (set?.key || c.item?.id || "x").length + 7), [palette, set?.key, c.item?.id]);
  const purchaseId = purchaseIdOf(result);
  const refundLeft = windowLeft(paidAt, SHOP2_REFUND_MS, now, refundUntilOf(result));
  const newItems = items.map((x) => x.item);
  const tryOn = {};
  for (const it of wearItems) tryOn[it.category] = it;
  const afterUser = composeTryOnUser(before, tryOn);
  // A single item the profile card does not draw (chat bubble, voice tile, typing flare...)
  // shows its own surface, else before and after were two identical profile cards.
  const single = !set && newItems.length === 1 ? newItems[0] : null;
  const surface = celeSurfaceOf(single);
  const balanceAfter = typeof result?.balance === "number" ? result.balance : s2.balance;
  const titleUnlocked = Boolean(result?.titleUnlocked || result?.title || (Array.isArray(result?.completed) && result.completed.length));
  const complete = set ? (pricing?.missingCount || 0) <= items.length : false;
  // A single piece that was the last one missing completes its set: the server names the title.
  const completedTitle = Array.isArray(result?.completed) ? result.completed[0]?.title?.name || null : null;

  const equip = async (list) => {
    setEquipping(true);
    const prev = currentLook(before);
    // One request: the server wears every piece, keeps the previous look as an outfit, logs one
    // undoable action and broadcasts the profile once (was one equip + profile reload per piece).
    let batch = null;
    try {
      batch = await s2.actions.equipItems(list.map((it) => it.id));
    } catch {
      batch = null;
    }
    if (batch) {
      setPrevSaved(batch.previousOutfitId ? { id: batch.previousOutfitId } : true);
      await s2.onLookChanged?.();
    } else {
      // Older server without POST /equip: the per-slot legacy equip.
      setPrevSaved(await s2.actions.saveOutfit(t("shop2.kasa.previousLook"), prev, true));
      for (const it of list) {
        if (sameId(s2.equippedIdFor(it.category), it.id)) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          await s2.onEquip?.(it, false);
        } catch {
          /* keep going */
        }
      }
    }
    setEquipping(false);
    setWorn(true);
    const undo = batch?.actionId
      ? async () => {
        await s2.actions.undo(batch.actionId);
        await s2.onLookChanged?.();
        s2.toast(t("shop2.celebrate.restored"), { tone: "ok" });
      }
      : () => restoreLook(s2, prev, list, t);
    s2.toast(t("shop2.celebrate.wornToast"), {
      tone: "ok",
      ms: 12000,
      // Undone: the pieces are off again, so "Hepsini kuşan" and the refund link come back.
      action: { label: t("shop2.celebrate.undo"), run: () => Promise.resolve(undo()).then(() => setWorn(false), (err) => s2.toast(err?.message || t("shop2.errors.undo"), { tone: "error" })) },
    });
  };
  useEffect(() => {
    if (autoEquip) equip(wearItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refund = async () => {
    if (!purchaseId) return;
    try {
      await s2.actions.refund(purchaseId);
      setRefunded(true);
      s2.toast(t("shop2.celebrate.refunded"), { tone: "ok" });
      onClose();
    } catch (err) {
      s2.toast(err?.message || t("shop2.errors.refund"), { tone: "error" });
    }
  };
  // Only a fully owned set or an owned item can be shown (POST /share).
  const share = () => s2.openShare(set && complete ? { setKey: set.key } : { itemId: newItems[0]?.id });
  const saveLook = async () => {
    const look = { ...currentLook(s2.me) };
    for (const it of wearItems) look[it.category] = it.id;
    await s2.actions.saveOutfit(set ? s2.setName(set) : s2.itemName(newItems[0]), look);
    s2.toast(t("shop2.kasa.lookSaved", { name: set ? s2.setName(set) : s2.itemName(newItems[0]) }), { tone: "ok" });
  };
  const name = set ? s2.setName(set) : c.kind === "cart" ? t("shop2.checkout.cartTitle", { n: items.length }) : s2.itemName(c.item);
  const slots = set ? set.pieces : items.map((x) => ({ item: x.item }));
  return (
    <div className={`s2-cele${reduce ? " is-reduced" : ""}`} style={{ "--c0": palette[0], "--c1": palette[1] || palette[0], "--c2": palette[2] || palette[0], "--c3": palette[3] || palette[2] || palette[0] }}>
      <CloseX onClick={onClose} label={t("shop2.common.close")} />
      <div className="s2-cele-stage">
        <span className="s2-rays" aria-hidden="true" />
        {!reduce ? (
          <span className="s2-parts" aria-hidden="true">
            {parts.map((p) => (
              <i key={p.id} style={{ "--a": `${p.angle}deg`, "--d": `${p.dist}px`, "--s": `${p.size}px`, "--dl": `${p.delay}ms`, background: p.color }} />
            ))}
          </span>
        ) : null}
        <div className={`s2-cele-ba${surface !== "profile" ? " is-surface" : ""}`}>
          <div className="s2-cele-before" aria-hidden={worn}>
            <CeleSurface kind={surface} user={before} item={single} />
          </div>
          <ChevronRight size={20} className="s2-cele-arrow" />
          <div className="s2-cele-after">
            <CeleSurface kind={surface} user={afterUser} item={single} after />
          </div>
          {set && s2.layout !== "phone" ? (
            <div className="s2-cele-side">
              <S2VoiceTile user={afterUser} size="sm" joined={{ who: t("shop2.sample.joinedShort"), sound: "" }} />
              <S2ChatMessage user={afterUser} text={t("shop2.celebrate.chatLine")} time={new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} />
            </div>
          ) : null}
        </div>
      </div>
      <div className="s2-cele-body">
        <div className="s2-eyebrow is-cele">
          {set && complete ? t("shop2.celebrate.setDone", { n: set.pieceCount }) : t("shop2.celebrate.bought")} · {t("shop2.celebrate.paid", { n: formatNumber(total, locale), b: formatNumber(balanceAfter, locale) })}
        </div>
        <h2>{set && complete ? t("shop2.celebrate.yoursSet", { name }) : t("shop2.celebrate.yours", { name })}</h2>
        <div className="s2-cele-slots">
          {slots.map((p, i) => {
            // A chosen-pieces buy shows the whole set: only what the user owns now gets a tick.
            const have = !set || p.owned || newIds.has(String(p.item.id));
            return (
            <span key={p.item.id} className={`s2-cele-slot${have ? "" : " is-missing"}`} style={{ "--i": i }}>
              <span className="s2-slot is-sm"><Shop2Art item={p.item} size="slot" me={s2.me} fit />{have ? <i className="s2-tickmark"><Check size={10} weight="bold" /></i> : null}</span>
              <small>{t(`shop2.catShort.${p.item.category}`)}</small>
            </span>
            );
          })}
        </div>
        <div className="s2-chips-wrap is-center">
          {titleUnlocked || (set && complete) ? <Chip tone="gold" icon={Crown}>{t("shop2.celebrate.titleUnlocked", { title: set?.reward?.title ? s2.itemName({ name: set.reward.title }) : completedTitle ? s2.itemName({ name: completedTitle }) : t("shop2.sets.rewardDefault", { name }) })}</Chip> : null}
          {set ? <Chip tone="green" icon={Check}>{t("shop2.celebrate.pieces", { n: Math.min(set.pieceCount, (pricing?.ownedCount || 0) + items.length), total: set.pieceCount })}</Chip> : null}
          {purchaseId && refundLeft > 0 && !refunded && !worn ? <Chip icon={Undo2}>{t("shop2.celebrate.refundChip", { t: mmss(refundLeft) })}</Chip> : null}
        </div>
        {picking ? (
          <div className="s2-pick">
            {wearItems.map((it) => (
              <label key={it.id} className="s2-check is-row">
                <GlassCheckbox checked={picked.has(String(it.id))} onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(String(it.id));
                  else next.delete(String(it.id));
                  setPicked(next);
                }} />
                <Shop2Art item={it} size="chip" me={s2.me} />
                <span>{s2.itemName(it)}</span>
                <small className="s2-muted">{t(`shop2.cat.${it.category}`)}</small>
              </label>
            ))}
            <button type="button" className="s2-btn is-primary is-wide" disabled={!picked.size || equipping} onClick={() => {
              setPicking(false);
              equip(wearItems.filter((it) => picked.has(String(it.id))));
            }}>
              <Shirt size={16} />{t("shop2.celebrate.wearPicked", { n: picked.size })}
            </button>
          </div>
        ) : (
          <>
            <button type="button" className={`s2-btn is-primary is-wide is-lg is-glow${worn ? " is-done" : ""}`} disabled={equipping || worn} onClick={() => equip(wearItems)}>
              <Shirt size={17} />
              {worn ? t("shop2.celebrate.worn") : equipping ? t("shop2.celebrate.wearing") : wearItems.length > 1 ? t("shop2.celebrate.wearAll") : t("shop2.celebrate.wearOne")}
            </button>
            <div className="s2-row">
              {wearItems.length > 1 ? <button type="button" className="s2-btn is-flex" onClick={() => setPicking(true)}><SlidersHorizontal size={15} />{t("shop2.celebrate.pick")}</button> : null}
              <button type="button" className="s2-btn is-flex" onClick={share}><Share2 size={15} />{t("shop2.celebrate.show")}</button>
            </div>
            <div className="s2-row">
              <button type="button" className="s2-btn is-flex" onClick={saveLook}><Bookmark size={15} />{t("shop2.kasa.saveLook")}</button>
              {set ? <button type="button" className="s2-btn is-flex" onClick={() => { s2.actions.setPref({ setMode: "stage" }); s2.openSet(set.key); onClose(); }}><Store size={15} />{t("shop2.celebrate.onStage")}</button> : null}
            </div>
          </>
        )}
        <p className="s2-note is-center">
          {purchaseId && refundLeft > 0 && !worn ? (
            <button type="button" className="s2-link" onClick={refund}><Undo2 size={13} />{t("shop2.celebrate.refund", { t: mmss(refundLeft) })}</button>
          ) : null}
          {prevSaved ? <span> · {t("shop2.celebrate.prevSaved")}</span> : null}
        </p>
      </div>
    </div>
  );
}

export default function Shop2Checkout({ checkout: c, onClose }) {
  const { t } = useLocale();
  const s2 = useS2();
  const set = c.kind === "set" ? s2.data.setDetails[c.setKey] : null;
  const pricing = set ? setPricing(set, c.pieceIds ? { selectedIds: c.pieceIds } : {}) : null;
  const items = useMemo(() => {
    if (c.kind === "set" && set) {
      const ids = c.pieceIds ? new Set(c.pieceIds.map(String)) : null;
      return set.pieces.filter((p) => !p.owned && (!ids || ids.has(String(p.item.id)))).map((p) => ({ item: p.item, price: p.item.price_descoin }));
    }
    if (c.kind === "cart") return c.items || [];
    return c.item ? [{ item: c.item, price: c.price ?? c.item.price_descoin }] : [];
  }, [c, set]);
  const total = c.kind === "set" ? (c.pieceIds ? pricing?.selectedTotal : pricing?.yourPrice) ?? 0 : items.reduce((s, x) => s + Number(x.price || 0), 0);
  const [phase, setPhase] = useState(c.phase === "done" ? "done" : "confirm");
  const [result, setResult] = useState(c.result || null);
  const [autoEquip, setAutoEquip] = useState(false);
  // Frozen at payment: after the buy the set reloads with every piece owned (price 0).
  const [paid, setPaid] = useState(null);
  if (c.kind === "set" && !set) return null;
  const view = paid || { items, total, pricing };
  return (
    <Layer kind={s2.layout === "phone" ? "sheet" : "dialog"} onClose={onClose} label={phase === "done" ? t("shop2.celebrate.label") : t("shop2.checkout.label")} className={`s2-dialog ${phase === "done" ? "is-cele" : "is-co"}`}>
      {phase === "done" ? (
        <Celebrate c={c} set={set} pricing={view.pricing} items={view.items} total={typeof result?.paid === "number" ? result.paid : view.total} result={result} autoEquip={autoEquip} onClose={onClose} />
      ) : (
        <Confirm c={c} set={set} pricing={pricing} items={items} total={total} onClose={onClose} onPaid={(res, { equipNow }) => {
          setPaid({ items, total, pricing });
          setResult(res);
          setAutoEquip(equipNow);
          setPhase("done");
        }} />
      )}
    </Layer>
  );
}
