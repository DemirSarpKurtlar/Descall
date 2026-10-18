/**
 * Menu groups for the in-call device menus (2.10.113): the microphone button
 * opens the input menu, the deafen button the output menu. On native iOS the
 * rows are AVAudioSession routes (DescallAudioRouter); elsewhere
 * enumerateDevices() lists. Pure: `t` and the hook values are passed in.
 */
import { iosBuiltInMicRoute, iosInputRows, iosOutputRows } from "./callAudioDevices.js";

function routeName(row, t) {
  switch (row.kind) {
    case "receiver":
      return "iPhone";
    case "speaker":
      return t("Loudspeaker");
    case "bluetooth":
      return row.name || "Bluetooth";
    case "headphones":
      return row.name || t("Headphones");
    case "car":
      return row.name || "CarPlay";
    case "airplay":
      return row.name || "AirPlay";
    case "usb":
      return row.name || "USB";
    default:
      return row.name || t("Default");
  }
}

function routeDetail(row, t) {
  if (row.kind === "receiver") return t("Earpiece");
  return "";
}

function webRows(devices, selectedId, kind, t) {
  const list = (devices || []).filter((d) => d && typeof d.deviceId === "string");
  const sel = selectedId || "";
  const rows = [];
  const hasDefault = list.some((d) => d.deviceId === "default" || d.deviceId === "");
  if (!hasDefault) rows.push({ id: "", name: t("System default"), kind, selected: !sel });
  for (const d of list) {
    const isDefault = d.deviceId === "default" || d.deviceId === "";
    const label = String(d.label || "").trim() || (isDefault ? t("System default") : t("Default"));
    rows.push({ id: d.deviceId, name: label, kind, selected: d.deviceId === sel || (isDefault && (!sel || sel === "default")) });
  }
  if (rows.length && !rows.some((r) => r.selected)) {
    const def = rows.find((r) => r.id === "" || r.id === "default");
    if (def) def.selected = true;
  }
  return rows;
}

/** Microphone menu. hook: useCall / useGroupCall / useServerVoice value. */
export function inputMenuGroups(hook, t) {
  const snap = hook?.iosAudioRoute;
  if (snap && (snap.routes || []).length) {
    const rows = iosInputRows(snap, t("iPhone microphone")).map((r) => ({
      ...r,
      kind: r.id === "builtin" ? "builtin" : r.kind,
      name: r.id === "builtin" ? t("iPhone microphone") : routeName(r, t),
    }));
    return [
      {
        id: "mic",
        label: t("Microphone"),
        kind: "input",
        rows,
        onSelect: (id) => hook.selectIosRoute?.(id === "builtin" ? iosBuiltInMicRoute(snap) : id),
      },
    ];
  }
  return [
    {
      id: "mic",
      label: t("Microphone"),
      kind: "input",
      rows: webRows(hook?.audioInputDevices, hook?.selectedAudioInput, "input", t),
      onSelect: (id) => hook?.setAudioInput?.(id),
    },
  ];
}

/** Speaker / output menu (opened from the deafen button). */
export function outputMenuGroups(hook, t) {
  const snap = hook?.iosAudioRoute;
  if (snap && (snap.routes || []).length) {
    const rows = iosOutputRows(snap).map((r) => ({ ...r, name: routeName(r, t), detail: routeDetail(r, t) }));
    return [{ id: "out", label: t("Audio output"), kind: "output", rows, onSelect: (id) => hook.selectIosRoute?.(id) }];
  }
  return [
    {
      id: "out",
      label: t("Audio output"),
      kind: "output",
      rows: webRows(hook?.audioOutputDevices, hook?.selectedAudioOutput, "output", t),
      onSelect: (id) => hook?.setAudioOutput?.(id),
    },
  ];
}
