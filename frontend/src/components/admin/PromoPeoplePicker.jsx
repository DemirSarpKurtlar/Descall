import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Search, Loader2, X } from "../ui/Icon.jsx";
import { Avatar } from "../ui/Avatar";
import OverlayPortal from "../ui/OverlayPortal.jsx";
import { adminPromoUsers } from "../../api/promo";
import { cleanQuery, visibleHits, splitMatch, moveActive, placePopover, DEBOUNCE_MS } from "../../lib/promoPeoplePicker";

function Hl({ text, q }) {
  const [a, m, b] = splitMatch(text, q);
  return m ? <>{a}<mark>{m}</mark>{b}</> : text;
}

function scrollParent(el) {
  for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
}

function kbInset() {
  try {
    return Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-inset")) || 0;
  } catch {
    return 0;
  }
}

/**
 * "Seçilenler": type part of a name or @username, the closest matches come up
 * as you type (server ranks them, Turkish letters and case do not matter).
 * ↑/↓ + Enter or a tap adds one; Backspace on an empty field removes the last.
 * The list is a body-level frosted popover (frost.css), so the admin panel's
 * glass cannot show through it and the iPhone keyboard cannot cover it.
 * The server checks every id again when the code is created.
 */
export default function PromoPeoplePicker({ value, onChange, t }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [status, setStatus] = useState("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState(null);
  const [said, setSaid] = useState("");
  const fieldRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const reqRef = useRef(null);
  const listId = useId();
  const term = cleanQuery(q);
  const pickedKey = value.map((u) => u.id).join(",");

  useEffect(() => {
    reqRef.current?.abort();
    if (!term) {
      setHits([]);
      setStatus("idle");
      setActive(-1);
      return undefined;
    }
    setStatus("loading");
    const ctl = new AbortController();
    reqRef.current = ctl;
    const id = setTimeout(async () => {
      try {
        const data = await adminPromoUsers(term, { exclude: pickedKey ? pickedKey.split(",") : [], signal: ctl.signal });
        if (ctl.signal.aborted) return;
        const list = visibleHits(data?.users, value);
        setHits(list);
        setActive(list.length ? 0 : -1);
        setStatus("done");
      } catch (err) {
        if (ctl.signal.aborted || err?.name === "AbortError") return;
        setHits([]);
        setActive(-1);
        setStatus(err?.status === 429 ? "slow" : "error");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
    // value is read through pickedKey; a new array with the same people is not a new search
  }, [term, pickedKey]);

  const shown = open && !!term;

  const measure = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewH = vv ? vv.height : window.innerHeight;
    const viewTop = vv ? vv.offsetTop : 0;
    // WKWebView often keeps the visual viewport full height under the keys; the
    // native inset (--kb-inset from useMobileKeyboard) is the part they cover.
    const kb = vv && vv.height < window.innerHeight - 80 ? 0 : kbInset();
    setPlace(placePopover({ anchor: r, viewH, viewTop, kb, wantH: 360 }));
  }, []);

  useLayoutEffect(() => {
    if (!shown) return undefined;
    measure();
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const vv = window.visualViewport;
    window.addEventListener("resize", later);
    window.addEventListener("scroll", later, true);
    vv?.addEventListener("resize", later);
    vv?.addEventListener("scroll", later);
    // The native keyboard inset arrives as a --kb-inset style change on <html>.
    const kbo = typeof MutationObserver === "function" ? new MutationObserver(later) : null;
    kbo?.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(later) : null;
    if (ro && fieldRef.current) ro.observe(fieldRef.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", later);
      window.removeEventListener("scroll", later, true);
      vv?.removeEventListener("resize", later);
      vv?.removeEventListener("scroll", later);
      ro?.disconnect();
      kbo?.disconnect();
    };
  }, [shown, measure, pickedKey]);

  // iPhone: when the keyboard (native inset or a shrunk visual viewport) would
  // cover the field, scroll the panel so the field sits in the upper part of
  // what is still visible, leaving room for the list under it.
  const padRef = useRef(null);
  const unpad = useCallback(() => {
    const p = padRef.current;
    if (p) p.el.style.paddingBottom = p.prev;
    padRef.current = null;
  }, []);
  useEffect(() => unpad, [unpad]);

  const keepVisible = useCallback(() => {
    const el = fieldRef.current;
    if (!el || document.activeElement !== inputRef.current) return;
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;
    const vv = window.visualViewport;
    const viewH = vv ? vv.height : window.innerHeight;
    const viewTop = vv ? vv.offsetTop : 0;
    const kb = vv && vv.height < window.innerHeight - 80 ? 0 : kbInset();
    const bottom = viewTop + viewH - kb;
    const r = el.getBoundingClientRect();
    const want = bottom - Math.min(240, (bottom - viewTop) * 0.5);
    if (r.bottom <= want) return;
    const sc = scrollParent(el);
    if (!sc) return;
    const need = Math.round(r.bottom - want);
    // Short panels can't scroll far enough; pad the bottom by the keyboard so
    // the field can still rise above it (undone on blur).
    const room = sc.scrollHeight - sc.clientHeight - sc.scrollTop;
    if (room < need) {
      if (padRef.current?.el !== sc) padRef.current = { el: sc, prev: sc.style.paddingBottom };
      const base = parseFloat(getComputedStyle(sc).paddingBottom) || 0;
      sc.style.paddingBottom = `${Math.round(base + need - room + 8)}px`;
    }
    sc.scrollTop += need;
    // Re-place the list right away; WebKit can deliver the scroll event late.
    measure();
    requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    let timer = 0;
    const later = () => {
      clearTimeout(timer);
      timer = setTimeout(keepVisible, 60);
    };
    const vv = window.visualViewport;
    vv?.addEventListener("resize", later);
    const mo = typeof MutationObserver === "function" ? new MutationObserver(later) : null;
    mo?.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      clearTimeout(timer);
      vv?.removeEventListener("resize", later);
      mo?.disconnect();
    };
  }, [keepVisible]);

  // Typing makes WebKit reveal the caret against the full layout viewport,
  // which can drop the field back under the keys; settle it again.
  useEffect(() => {
    if (!shown) return undefined;
    const id = setTimeout(keepVisible, 40);
    return () => clearTimeout(id);
  }, [shown, term, keepVisible]);

  useEffect(() => {
    if (active < 0 || !listRef.current) return;
    listRef.current.querySelector(`[data-i="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const pick = (u) => {
    if (!u || value.some((v) => v.id === u.id)) return;
    onChange([...value, u]);
    setQ("");
    setHits([]);
    setActive(-1);
    setSaid(t("promo.pickAdded", { name: u.display_name || u.username }));
    inputRef.current?.focus({ preventScroll: true });
  };

  const remove = (u) => {
    onChange(value.filter((v) => v.id !== u.id));
    setSaid(t("promo.pickRemoved", { name: u.display_name || u.username }));
  };

  const onKeyDown = (e) => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp" || ((k === "Home" || k === "End") && shown && hits.length)) {
      if (!hits.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => moveActive(a, hits.length, k));
    } else if (k === "Enter") {
      if (e.nativeEvent?.isComposing) return;
      e.preventDefault();
      if (shown && hits[active]) pick(hits[active]);
    } else if (k === "Escape") {
      if (shown) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (k === "Backspace" && !q && value.length) {
      remove(value[value.length - 1]);
    } else if (k === "Tab") {
      setOpen(false);
    }
  };

  const activeId = shown && hits[active] ? `${listId}-o${active}` : undefined;
  const busy = status === "loading";

  return (
    <div className="mt-f">
      <span id={`${listId}-l`}>{t("promo.pickPeople")}</span>
      <div
        ref={fieldRef}
        className={`mt-in pc-chips${shown ? " is-open" : ""}`}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        <Search size={15} className="pc-chips-ic" aria-hidden="true" />
        {value.map((u) => (
          <span className="pc-chip" key={u.id} title={`@${u.username}`}>
            <Avatar name={u.display_name || u.username} size={20} user={{ id: u.id, username: u.username, avatarUrl: u.avatar_url }} animate="none" />
            <span className="pc-chip-t">{u.display_name || u.username}</span>
            <button type="button" aria-label={t("promo.removePerson", { name: u.display_name || u.username })} onClick={() => remove(u)}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={q}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-labelledby={`${listId}-l`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={value.length ? t("promo.pickMorePh") : t("promo.pickPeoplePh")}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setTimeout(keepVisible, 320);
          }}
          onBlur={() => {
            setOpen(false);
            unpad();
          }}
          onKeyDown={onKeyDown}
        />
        {busy ? <Loader2 size={14} className="pc-chips-spin" aria-hidden="true" /> : null}
      </div>
      <span className="pc-sr" aria-live="polite">{said}</span>
      {shown && place ? (
        <OverlayPortal>
          <div
            className={`pc-suggest is-${place.side}`}
            style={{
              left: place.left,
              width: place.width,
              maxHeight: place.maxH,
              ...(place.side === "below" ? { top: place.top } : { bottom: place.bottom }),
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {hits.length ? (
              <ul ref={listRef} id={listId} role="listbox" aria-labelledby={`${listId}-l`}>
                {hits.map((u, i) => (
                  <li
                    key={u.id}
                    id={`${listId}-o${i}`}
                    data-i={i}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? "on" : ""}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => pick(u)}
                  >
                    <Avatar name={u.display_name || u.username} size={30} user={{ id: u.id, username: u.username, avatarUrl: u.avatar_url }} animate="none" />
                    <span className="pc-sg-t">
                      <b><Hl text={u.display_name || u.username} q={term} /></b>
                      <span>@<Hl text={u.username} q={term} /></span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div id={listId} role="listbox" aria-labelledby={`${listId}-l`} className="pc-sg-empty">
                {busy ? (
                  <><Loader2 size={15} className="pc-chips-spin" aria-hidden="true" />{t("promo.pickSearching")}</>
                ) : status === "slow" ? t("promo.pickSlow")
                  : status === "error" ? t("promo.pickError")
                    : <><b>{t("promo.pickNone", { q: term })}</b><span>{t("promo.pickNoneHint")}</span></>}
              </div>
            )}
            {hits.length ? <div className="pc-sg-foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd>{t("promo.pickHintMove")}<kbd>Enter</kbd>{t("promo.pickHintAdd")}<kbd>Esc</kbd>{t("promo.pickHintClose")}</div> : null}
          </div>
        </OverlayPortal>
      ) : null}
    </div>
  );
}
