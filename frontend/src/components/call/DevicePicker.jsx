import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bluetooth,
  Car,
  Cast,
  Check,
  ChevronUp,
  Headphones,
  Mic,
  Smartphone,
  Speaker,
  Video,
  Volume2,
} from "lucide-react";
import { useT } from "../../context/LocaleContext";
import { hapticSelection } from "../../lib/fluid/haptics";

/*
 * In-call device menus (2.10.113). Liquid Glass: one heavy frosted surface
 * (.call-device-menu is in styles/frost.css, background never readable),
 * anchored to and scaling out of the button that opened it, critically
 * damped spring, checkmark on the current device. Microphone button → input
 * menu, deafen (headphones) button → output menu, camera → camera menu.
 * Opens from the chevron badge, a long press, or a right click.
 */

const LONG_PRESS_MS = 420;
const MENU_GAP = 12;
const EDGE = 10;
/** Compact desktop menu (2.11.3): never wider than this; long names ellipsize with a tooltip. */
export const DEVICE_MENU_MAX_W = 320;

const KIND_ICON = {
  mic: Mic,
  builtin: Mic,
  input: Mic,
  receiver: Smartphone,
  speaker: Volume2,
  output: Speaker,
  bluetooth: Bluetooth,
  headphones: Headphones,
  car: Car,
  airplay: Cast,
  usb: Headphones,
  system: Speaker,
  camera: Video,
};

function deviceName(device, fallback) {
  const label = String(device?.label || "").trim();
  return label || fallback;
}

/** enumerateDevices() list → menu rows. "" / "default" both mean the system default. */
export function deviceRows(devices, selectedId, { kind = "input", defaultLabel = "Default" } = {}) {
  const list = (devices || []).filter((d) => d && typeof d.deviceId === "string");
  const sel = selectedId || "";
  const hasDefault = list.some((d) => d.deviceId === "default" || d.deviceId === "");
  const rows = [];
  if (!hasDefault) rows.push({ id: "", name: defaultLabel, kind, selected: !sel });
  for (const d of list) {
    const isDefault = d.deviceId === "default" || d.deviceId === "";
    rows.push({
      id: d.deviceId,
      name: deviceName(d, defaultLabel),
      kind,
      selected: d.deviceId === sel || (isDefault && (!sel || sel === "default")),
    });
  }
  if (rows.length && !rows.some((r) => r.selected)) {
    // The saved device is not connected: the system default is what plays.
    const def = rows.find((r) => r.id === "" || r.id === "default");
    if (def) def.selected = true;
  }
  return rows;
}

function useAnchorRect(anchorRef, open) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, open]);
  return rect;
}

/**
 * groups: [{ id, label, rows: [{ id, name, kind, selected, detail? }], onSelect(id) }]
 */
export function CallDeviceMenu({ open, anchorRef, title, groups = [], onClose, menuId }) {
  const t = useT();
  const reduce = useReducedMotion();
  const menuRef = useRef(null);
  const rect = useAnchorRect(anchorRef, open);
  const [size, setSize] = useState({ w: 260, h: 0 });

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    if (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1) setSize({ w: r.width, h: r.height });
  });

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (anchorRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(menuRef.current?.querySelectorAll('[role="menuitemradio"]') || [])];
      if (!items.length) return;
      event.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll('[role="menuitemradio"]');
      const current = menuRef.current?.querySelector('[role="menuitemradio"][aria-checked="true"]');
      (current || items?.[0])?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (typeof document === "undefined") return null;

  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const w = Math.min(size.w || 260, DEVICE_MENU_MAX_W, vw - EDGE * 2);
  let left = rect ? rect.left + rect.width / 2 - w / 2 : EDGE;
  left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
  const above = rect ? rect.top - MENU_GAP : vh / 2;
  const fitsAbove = !rect || above - (size.h || 0) >= EDGE;
  const style = rect
    ? fitsAbove
      ? { left, bottom: vh - above }
      : { left, top: Math.min(rect.bottom + MENU_GAP, vh - (size.h || 0) - EDGE) }
    : { left, top: EDGE };
  const originX = rect ? rect.left + rect.width / 2 - left : w / 2;
  const transformOrigin = `${Math.round(originX)}px ${fitsAbove ? "100%" : "0%"}`;

  const spring = reduce ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.34 };
  const hidden = reduce
    ? { opacity: 0 }
    : { opacity: 0, scale: 0.82, y: fitsAbove ? 10 : -10, filter: "blur(6px)" };

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="call-device-menu"
          ref={menuRef}
          id={menuId}
          className="call-device-menu"
          role="menu"
          aria-label={title}
          data-fitsabove={fitsAbove ? "1" : "0"}
          style={{ ...style, transformOrigin, maxWidth: Math.min(DEVICE_MENU_MAX_W, vw - EDGE * 2) }}
          initial={hidden}
          animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
          exit={hidden}
          transition={spring}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {groups.map((group, gi) => (
            <div key={group.id} className="call-device-group" role="group" aria-label={group.label}>
              {gi > 0 ? <div className="call-device-sep" aria-hidden /> : null}
              {group.label ? <div className="call-device-heading">{group.label}</div> : null}
              {(group.rows || []).length ? (
                group.rows.map((row) => {
                  const Icon = KIND_ICON[row.kind] || KIND_ICON[group.kind] || Speaker;
                  return (
                    <button
                      key={`${group.id}-${row.id || "default"}`}
                      type="button"
                      role="menuitemradio"
                      aria-checked={row.selected ? "true" : "false"}
                      className={`call-device-row${row.selected ? " is-selected" : ""}`}
                      title={row.detail ? `${row.name} · ${row.detail}` : row.name}
                      onClick={() => {
                        hapticSelection();
                        group.onSelect?.(row.id, row);
                        onClose?.();
                      }}
                    >
                      <span className="call-device-ico" aria-hidden>
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <span className="call-device-text">
                        <span className="call-device-name">{row.name}</span>
                        {row.detail ? <span className="call-device-detail">{row.detail}</span> : null}
                      </span>
                      <span className="call-device-check" aria-hidden>
                        {row.selected ? <Check size={14} strokeWidth={2.8} /> : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="call-device-empty">{t("No devices found")}</div>
              )}
            </div>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

/** Legacy sections ({ id, label, devices, selectedId, onSelect }) → groups. */
function sectionsToGroups(sections, defaultLabel) {
  return (sections || []).map((section) => ({
    id: section.id,
    label: section.label,
    kind: section.kind || (section.id === "cam" || section.id === "camera" ? "camera" : section.id === "out" ? "output" : "input"),
    rows:
      section.rows ||
      deviceRows(section.devices, section.selectedId, {
        kind: section.kind || (section.id === "cam" || section.id === "camera" ? "camera" : section.id === "out" ? "output" : "input"),
        defaultLabel,
      }),
    onSelect: section.onSelect,
  }));
}

/**
 * A dock control (mic / deafen / camera) with a chevron badge that opens its
 * device menu. Long press (touch) or right click on the control opens it too;
 * a normal tap still toggles the control.
 */
export function DockDeviceSlot({ menuLabel, sections, groups, onOpen, children, className = "", controlRef }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const pressRef = useRef({ timer: null, fired: false, x: 0, y: 0 });
  const menuId = useRef(`call-device-menu-${Math.random().toString(36).slice(2, 8)}`).current;

  const show = useCallback(() => {
    setOpen((value) => {
      if (!value) onOpen?.();
      return true;
    });
  }, [onOpen]);
  const close = useCallback(() => setOpen(false), []);
  // Lets another control (e.g. the More menu on iPhone) open this menu.
  useEffect(() => {
    if (!controlRef) return undefined;
    controlRef.current = { open: show, close };
    return () => {
      if (controlRef.current?.open === show) controlRef.current = null;
    };
  }, [controlRef, show, close]);

  const clearPress = () => {
    if (pressRef.current.timer) clearTimeout(pressRef.current.timer);
    pressRef.current.timer = null;
  };

  const resolvedGroups = groups || sectionsToGroups(sections, t("Default"));

  return (
    <div
      className={`server-voice-dock-device${open ? " is-menu-open" : ""}${className ? ` ${className}` : ""}`}
      ref={rootRef}
      onPointerDown={(event) => {
        if (event.target.closest?.(".server-voice-dock-chevron")) return;
        pressRef.current.fired = false;
        pressRef.current.x = event.clientX;
        pressRef.current.y = event.clientY;
        clearPress();
        if (event.pointerType === "mouse") return;
        pressRef.current.timer = setTimeout(() => {
          pressRef.current.timer = null;
          pressRef.current.fired = true;
          hapticSelection();
          show();
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(event) => {
        if (!pressRef.current.timer) return;
        if (Math.hypot(event.clientX - pressRef.current.x, event.clientY - pressRef.current.y) > 10) clearPress();
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onClickCapture={(event) => {
        // The long press opened the menu: swallow the tap that ends it.
        if (pressRef.current.fired) {
          pressRef.current.fired = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        show();
      }}
    >
      {children}
      <button
        type="button"
        className={`server-voice-dock-chevron${open ? " is-open" : ""}`}
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={menuLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open) close();
          else show();
        }}
      >
        <ChevronUp size={11} strokeWidth={2.6} aria-hidden />
      </button>
      <CallDeviceMenu open={open} anchorRef={rootRef} title={menuLabel} groups={resolvedGroups} onClose={close} menuId={menuId} />
    </div>
  );
}
