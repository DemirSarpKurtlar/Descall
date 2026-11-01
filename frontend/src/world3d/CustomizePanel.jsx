/**
 * "Karakterini oluştur" (docs/design/3d-world/approved-ui-5.png, drafts.html #s5):
 * glass panel with Saç / Kıyafet / Aksesuar / Yüz tabs, a 3 x 2 grid of swatch cards
 * (name + "Ücretsiz" or "N DesCoin"), the colour row, Kaydet and Rastgele.
 *
 * Every click previews on your own avatar at once (Customizer.preview). Kaydet saves
 * through POST /api/world3d/look; when the look has paid items you do not own yet it
 * first asks for a purchase confirmation (total, balance after, "Satın al ve kaydet").
 * Prices always come from the server (GET /api/world3d/cosmetics).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../context/LocaleContext";
import { ITEMS, COLOR_ROW, HAIR_COLORS, SKINS, BASE_SPEC, itemsInSlot, cleanSpec, randomSpec, specItems } from "./engine/look.js";
import { newRequestId } from "./net/cosmeticsApi.js";
import "./customize.css";

const TABS = [
  { id: "hair", key: "world3d.custom.tabs.hair" },
  { id: "top", key: "world3d.custom.tabs.top" },
  { id: "acc", key: "world3d.custom.tabs.acc" },
  { id: "face", key: "world3d.custom.tabs.face" },
];

function sameSpec(a, b) {
  return JSON.stringify(cleanSpec(a)) === JSON.stringify(cleanSpec(b));
}

export default function CustomizePanel({ api, getCustomizer, onSaved, onClose, initialTab = "top" }) {
  const t = useT();
  const [tab, setTab] = useState(initialTab);
  const [state, setState] = useState(null); // { items, owned, look, balance, available }
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [focusAcc, setFocusAcc] = useState(null);
  const [confirm, setConfirm] = useState(null); // { items, total, requestId }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: ok|error, text }
  const initial = useRef(null);
  const savedRef = useRef(false);

  // ------------------------------------------------------------ load + camera
  useEffect(() => {
    let live = true;
    const cz = getCustomizer?.();
    cz?.openCamera();
    const wearing = cz?.currentSpec?.() || BASE_SPEC;
    initial.current = cleanSpec(wearing);
    (async () => {
      try {
        const s = await api.state();
        if (!live) return;
        setState({ ...s, owned: new Set(s.owned || []) });
        const start = cleanSpec(s.look || wearing);
        setSaved(s.look ? cleanSpec(s.look) : null);
        setDraft(start);
        setFocusAcc(start.acc[0] || null);
        cz?.preview(start);
      } catch (err) {
        if (!live) return;
        setLoadError(err?.code === "offline" ? "offline" : "failed");
        setDraft(initial.current);
      }
    })();
    return () => {
      live = false;
      const c = getCustomizer?.();
      if (!c) return;
      // closing without saving puts your avatar back as it was
      if (!savedRef.current) c.preview(initial.current);
      c.previewSpec = null;
      c.closeCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceOf = useCallback((id) => state?.items?.find((i) => i.id === id)?.price ?? null, [state]);
  const isFree = useCallback((id) => {
    const p = priceOf(id);
    return p === 0;
  }, [priceOf]);
  const owns = useCallback((id) => isFree(id) || Boolean(state?.owned?.has(id)), [isFree, state]);

  const update = useCallback((next) => {
    const spec = cleanSpec(next);
    setDraft(spec);
    setNotice(null);
    getCustomizer?.()?.preview(spec);
  }, [getCustomizer]);

  // ------------------------------------------------------------ grid
  const pick = useCallback((id) => {
    if (!draft) return;
    const it = ITEMS[id];
    if (it.slot !== "acc") {
      update({ ...draft, [it.slot]: id });
      return;
    }
    const wearing = draft.acc.includes(id);
    if (wearing) {
      const acc = draft.acc.filter((x) => x !== id);
      update({ ...draft, acc });
      setFocusAcc(acc[acc.length - 1] || null);
      return;
    }
    const acc = draft.acc.filter((x) => ITEMS[x].zone !== it.zone).concat([id]);
    update({ ...draft, acc });
    setFocusAcc(id);
  }, [draft, update]);

  const selected = useCallback((id) => {
    if (!draft) return false;
    const it = ITEMS[id];
    return it.slot === "acc" ? draft.acc.includes(id) : draft[it.slot] === id;
  }, [draft]);

  // ------------------------------------------------------------ colour row
  const colorRow = useMemo(() => {
    if (!draft) return { colors: [], value: null, target: null };
    if (tab === "face") return { colors: SKINS.map((s) => s.skin), value: draft.skin, target: "skin" };
    if (tab === "hair") return { colors: HAIR_COLORS, value: draft.colors.hair ?? null, target: "hair" };
    if (tab === "top") return { colors: COLOR_ROW, value: draft.colors.top ?? null, target: "top" };
    const target = focusAcc && draft.acc.includes(focusAcc) ? focusAcc : null;
    return { colors: COLOR_ROW, value: target ? draft.colors[target] ?? null : null, target };
  }, [draft, tab, focusAcc]);

  const pickColor = useCallback((i) => {
    if (!draft || !colorRow.target) return;
    if (colorRow.target === "skin") {
      update({ ...draft, skin: i });
      return;
    }
    const colors = { ...draft.colors };
    // a second click on the chosen colour goes back to the item's own colours
    if (colors[colorRow.target] === i) delete colors[colorRow.target];
    else colors[colorRow.target] = i;
    update({ ...draft, colors });
  }, [draft, colorRow, update]);

  // ------------------------------------------------------------ save / random
  const missing = useMemo(() => {
    if (!draft || !state) return [];
    return specItems(draft).filter((id) => !owns(id)).map((id) => ({ id, price: priceOf(id) || 0 }));
  }, [draft, state, owns, priceOf]);

  const doSave = useCallback(async (purchase = null) => {
    if (!draft || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.save(draft, purchase);
      savedRef.current = true;
      setSaved(res.look);
      initial.current = res.look;
      setState((s) => ({ ...s, owned: new Set(res.owned || []), balance: typeof res.balance === "number" ? res.balance : s.balance }));
      setConfirm(null);
      setNotice({ kind: "ok", text: purchase ? t("world3d.custom.boughtSaved") : t("world3d.custom.saved") });
      onSaved?.(res.look, res);
    } catch (err) {
      const code = err?.code;
      if (code === "needs_purchase" || code === "price_changed") {
        const items = Array.isArray(err.items) ? err.items : missing;
        setState((s) => ({ ...s, balance: typeof err.balance === "number" ? err.balance : s.balance, items: s.items.map((i) => ({ ...i, price: items.find((x) => x.id === i.id)?.price ?? i.price })) }));
        setConfirm({ items, total: err.total ?? items.reduce((a, x) => a + x.price, 0), requestId: newRequestId(), changed: code === "price_changed" });
      } else if (code === "insufficient") {
        setState((s) => ({ ...s, balance: typeof err.balance === "number" ? err.balance : s.balance }));
        setNotice({ kind: "error", text: t("world3d.custom.insufficient", { n: Math.max(0, (err.total || 0) - (err.balance || 0)) }) });
      } else if (code === "WALLET_FROZEN") {
        setNotice({ kind: "error", text: t("world3d.custom.frozen") });
      } else if (code === "unavailable") {
        setNotice({ kind: "error", text: t("world3d.custom.unavailable") });
      } else if (code === "offline") {
        setNotice({ kind: "error", text: t("world3d.custom.offline") });
      } else if (code === "rate_limited") {
        setNotice({ kind: "error", text: t("world3d.custom.slowDown") });
      } else {
        setNotice({ kind: "error", text: t("world3d.custom.failed") });
      }
    } finally {
      setBusy(false);
    }
  }, [api, draft, busy, missing, onSaved, t]);

  const onSave = useCallback(() => {
    if (!draft) return;
    if (missing.length) {
      setConfirm({ items: missing, total: missing.reduce((a, x) => a + x.price, 0), requestId: newRequestId() });
      return;
    }
    doSave(null);
  }, [draft, missing, doSave]);

  const onRandom = useCallback(() => {
    if (!draft) return;
    const allowed = new Set(Object.keys(ITEMS).filter((id) => owns(id)));
    const next = randomSpec(draft, allowed);
    update(next);
    setFocusAcc(next.acc[next.acc.length - 1] || null);
  }, [draft, owns, update]);

  // Escape: close the confirmation first, then the panel
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (confirm) setConfirm(null);
      else onClose?.();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirm, onClose]);

  const fmt = (n) => t("world3d.custom.price", { n });
  const dirty = draft && saved ? !sameSpec(draft, saved) : Boolean(draft);
  const balance = state?.balance ?? 0;

  return (
    <section className="w3d-cust w3d-glass" role="dialog" aria-label={t("world3d.custom.title")} data-tab={tab}>
      <header className="w3d-cust-head">
        <h3>{t("world3d.custom.title")}</h3>
        <p>{t("world3d.custom.subtitle")}</p>
        <button type="button" className="w3d-cust-x" onClick={() => onClose?.()} aria-label={t("world3d.custom.close")} title={t("world3d.custom.close")}>
          <svg viewBox="0 0 16 16" aria-hidden><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </header>

      <div className="w3d-cust-tabs" role="tablist" aria-label={t("world3d.custom.title")}>
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? "is-on" : ""} onClick={() => setTab(x.id)}>
            {t(x.key)}
          </button>
        ))}
      </div>

      <div className="w3d-cust-grid" role="tabpanel">
        {itemsInSlot(tab).map((id) => {
          const it = ITEMS[id];
          const price = priceOf(id);
          const on = selected(id);
          let label;
          if (price == null) label = <span className="w3d-cust-price is-dim">{" "}</span>;
          else if (price === 0) label = <span className="w3d-cust-price is-free">{t("world3d.custom.free")}</span>;
          else if (state?.owned?.has(id)) label = <span className="w3d-cust-price is-owned">{t("world3d.custom.owned")}</span>;
          else label = <span className="w3d-cust-price">{fmt(price)}</span>;
          return (
            <button
              key={id}
              type="button"
              className={`w3d-cust-item${on ? " is-on" : ""}`}
              aria-pressed={on}
              data-item={id}
              disabled={!draft}
              onClick={() => pick(id)}
            >
              <span className="w3d-cust-sw" style={{ background: `linear-gradient(135deg, ${it.swatch[0]}, ${it.swatch[1]})` }} aria-hidden />
              <span className="w3d-cust-name">{t(`world3d.custom.items.${id}`)}</span>
              {label}
            </button>
          );
        })}
      </div>

      <div className="w3d-cust-colors" role="radiogroup" aria-label={t(tab === "face" ? "world3d.custom.skinLabel" : "world3d.custom.colorLabel")}>
        {colorRow.colors.map((c, i) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={colorRow.value === i}
            className={colorRow.value === i ? "is-on" : ""}
            style={{ background: c }}
            disabled={!colorRow.target}
            aria-label={t(tab === "face" ? "world3d.custom.skinN" : "world3d.custom.colorN", { n: i + 1 })}
            onClick={() => pickColor(i)}
          />
        ))}
      </div>

      <div className="w3d-cust-actions">
        <button type="button" className="w3d-cust-btn" onClick={onSave} disabled={!draft || busy || loadError === "offline" || (!dirty && !missing.length)}>
          {busy && !confirm ? t("world3d.custom.saving") : t("world3d.custom.save")}
        </button>
        <button type="button" className="w3d-cust-btn is-ghost" onClick={onRandom} disabled={!draft || busy}>
          {t("world3d.custom.random")}
        </button>
        {notice ? <span className={`w3d-cust-note is-${notice.kind}`} role="status">{notice.text}</span> : null}
        {!notice && loadError ? <span className="w3d-cust-note is-error" role="status">{t(loadError === "offline" ? "world3d.custom.offline" : "world3d.custom.failed")}</span> : null}
      </div>

      {confirm ? (
        <div className="w3d-cust-buy" role="alertdialog" aria-modal="true" aria-label={t("world3d.custom.buy.title")}>
          <h4>{t("world3d.custom.buy.title")}</h4>
          <p className="w3d-cust-buy-sub">{confirm.changed ? t("world3d.custom.buy.changed") : t("world3d.custom.buy.body")}</p>
          <ul>
            {confirm.items.map((x) => (
              <li key={x.id}>
                <span className="w3d-cust-buy-sw" style={{ background: `linear-gradient(135deg, ${ITEMS[x.id].swatch[0]}, ${ITEMS[x.id].swatch[1]})` }} aria-hidden />
                <span>{t(`world3d.custom.items.${x.id}`)}</span>
                <b>{fmt(x.price)}</b>
              </li>
            ))}
          </ul>
          <dl>
            <div><dt>{t("world3d.custom.buy.total")}</dt><dd className="is-gold">{fmt(confirm.total)}</dd></div>
            <div><dt>{t("world3d.custom.buy.balance")}</dt><dd>{fmt(balance)}</dd></div>
            <div><dt>{t("world3d.custom.buy.after")}</dt><dd className={balance - confirm.total < 0 ? "is-bad" : ""}>{fmt(balance - confirm.total)}</dd></div>
          </dl>
          {balance < confirm.total ? <p className="w3d-cust-note is-error">{t("world3d.custom.insufficient", { n: confirm.total - balance })}</p> : null}
          {notice?.kind === "error" ? <p className="w3d-cust-note is-error">{notice.text}</p> : null}
          <div className="w3d-cust-actions">
            <button
              type="button"
              className="w3d-cust-btn"
              disabled={busy || balance < confirm.total}
              onClick={() => doSave({ items: confirm.items.map((x) => x.id), total: confirm.total, requestId: confirm.requestId })}
            >
              {busy ? t("world3d.custom.buying") : t("world3d.custom.buy.confirm")}
            </button>
            <button type="button" className="w3d-cust-btn is-ghost" disabled={busy} onClick={() => setConfirm(null)}>
              {t("world3d.custom.buy.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
