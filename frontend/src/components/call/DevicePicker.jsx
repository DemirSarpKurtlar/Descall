import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useT } from "../../context/LocaleContext";

function deviceName(device, fallback) {
  const label = String(device?.label || "").trim();
  return label || fallback;
}

export function DeviceMenu({ sections, onClose }) {
  const t = useT();
  return (
    <div className="server-voice-device-menu" role="menu" onPointerDown={(event) => event.stopPropagation()}>
      {sections.map((section) => (
        <div key={section.id} className="server-voice-device-section">
          <div className="server-voice-device-heading">{section.label}</div>
          {(section.devices || []).length ? (
            section.devices.map((device) => {
              const selected = device.deviceId === section.selectedId;
              const name = deviceName(device, t("Default"));
              return (
                <button
                  key={`${section.id}-${device.deviceId || name}`}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`server-voice-device-item${selected ? " is-selected" : ""}`}
                  onClick={() => {
                    section.onSelect?.(device.deviceId);
                    onClose?.();
                  }}
                >
                  <span>{name}</span>
                </button>
              );
            })
          ) : (
            <div className="server-voice-device-empty">{t("Default")}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Mic or camera control with a small chevron that opens the device menu. */
export function DockDeviceSlot({ menuLabel, sections, onOpen, children }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="server-voice-dock-device" ref={rootRef}>
      {children}
      <button
        type="button"
        className={`server-voice-dock-chevron${open ? " is-open" : ""}`}
        aria-label={menuLabel}
        aria-expanded={open}
        title={menuLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((value) => {
            const next = !value;
            if (next) onOpen?.();
            return next;
          });
        }}
      >
        <ChevronUp size={11} aria-hidden />
      </button>
      {open ? <DeviceMenu sections={sections} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
