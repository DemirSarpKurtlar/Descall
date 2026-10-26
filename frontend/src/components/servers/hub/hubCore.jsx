/* Shared plumbing for the server hub pages: context, route stack, drafts, page frame. */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { hapticError, hapticSuccess } from "../../../lib/fluid/haptics";
import { Back, Foot, Group, Nav, NavText, Row, Scroll, Sec, Field, XBtn } from "./kit";

export const HubCtx = createContext(null);
export const useHub = () => useContext(HubCtx);

let keySeq = 0;
export const routeKey = () => `r${++keySeq}`;

/** Renders "<b>Mert</b> seni davet etti" safely (no HTML injection from names). */
export function Rich({ text, bStyle }) {
  const parts = String(text || "").split(/(<b>.*?<\/b>)/g);
  return parts.map((p, i) => {
    const m = p.match(/^<b>(.*)<\/b>$/);
    return m ? <b key={i} style={bStyle}>{m[1]}</b> : <span key={i}>{p}</span>;
  });
}

/** Run an async action with toast + haptics; returns [run, busy]. */
export function useRun() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const run = useCallback(async (fn, { ok, fail } = {}) => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast(ok, "success");
      hapticSuccess();
      return r ?? true;
    } catch (err) {
      hapticError();
      toast(err?.message || fail || "Error", "error");
      return undefined;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [toast]);
  return [run, busy];
}

/** Draft state that survives the page being popped back to / re-mounted (kept per route key). */
export function useRouteDraft(route, init) {
  const hub = useHub();
  const store = hub.drafts;
  const key = route.key;
  const [v, setV] = useState(() => (store.has(key) ? store.get(key) : (typeof init === "function" ? init() : init)));
  const cur = useRef(v);
  cur.current = store.has(key) ? store.get(key) : v;
  // Writes go to the store synchronously, so a child page can update this draft even while
  // this page is unmounted (iPad shows only the top page).
  const set = useCallback((u) => {
    const prev = store.has(key) ? store.get(key) : cur.current;
    const next = typeof u === "function" ? u(prev) : u;
    store.set(key, next);
    cur.current = next;
    setV(next);
  }, [store, key]);
  useEffect(() => { if (!store.has(key)) store.set(key, v); }, [store, key, v]);
  return [cur.current, set];
}

/**
 * A page = nav bar + scroller. Left side: phone → back to the previous page
 * (or İptal when the page is a standalone sheet); tablet → back only inside the same section.
 */
export function PageFrame({ route, title, right, left, children, scrollStyle, noScroll }) {
  const hub = useHub();
  const leftNode = left !== undefined ? left : hub.backFor(route);
  return (
    <>
      <Nav left={leftNode} title={title} right={right} />
      {noScroll ? children : <Scroll form={hub.tablet} style={scrollStyle}>{children}</Scroll>}
    </>
  );
}

export function DoneBtn({ label, onClick, disabled }) {
  return <NavText onClick={onClick} disabled={disabled}>{label}</NavText>;
}
export { Back, XBtn };

/** Generic single text value editor (Ad, Açıklama, Konu, Takma ad…). */
export function TextPage({ route }) {
  const hub = useHub();
  const { s } = hub;
  const [val, setVal] = useRouteDraft(route, () => route.value || "");
  const [run, busy] = useRun();
  const trimmed = String(val || "").trim();
  const changed = trimmed !== String(route.value || "").trim();
  const invalid = route.required && trimmed.length < (route.minLength || 1);
  const done = async () => {
    if (!changed) { hub.pop(); return; }
    const ok = await run(() => route.onDone(trimmed));
    if (ok !== undefined && ok !== false) hub.pop();
  };
  return (
    <PageFrame route={route} title={route.title} right={<DoneBtn label={route.doneLabel || s.done} onClick={done} disabled={busy || invalid} />}>
      {route.sec != null ? <Sec first>{route.sec}</Sec> : <Sec first>{""}</Sec>}
      <Field value={val} onChange={setVal} placeholder={route.placeholder} autoFocus multiline={route.multiline} rows={route.rows}
        maxLength={route.maxLength} pre={route.pre} onEnter={route.multiline ? undefined : done} label={route.title} />
      {route.foot ? <Foot>{route.foot}</Foot> : null}
    </PageFrame>
  );
}

/** Generic single choice list (Yavaş mod, AFK süresi, Geçerlilik…). Tapping saves and pops. */
export function PickPage({ route }) {
  const hub = useHub();
  const [run, busy] = useRun();
  const [cur, setCur] = useState(route.value);
  const pick = async (id) => {
    if (busy) return;
    setCur(id);
    const ok = await run(() => route.onPick(id));
    if (ok !== undefined && ok !== false) hub.pop(); else setCur(route.value);
  };
  return (
    <PageFrame route={route} title={route.title}>
      <Sec first>{route.sec || ""}</Sec>
      <Group>
        {route.options.map((o) => (
          <Row key={String(o.id)} ico={o.ico} c={o.c} lead={o.lead} t={o.t} sub={o.sub} check={String(cur) === String(o.id)} onClick={() => pick(o.id)} disabled={o.disabled} />
        ))}
      </Group>
      {route.foot ? <Foot>{route.foot}</Foot> : null}
    </PageFrame>
  );
}
