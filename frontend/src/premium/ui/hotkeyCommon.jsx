import { useT } from "../../context/localeContextInstance";
import { Note } from "./PremiumAudioKit.jsx";

/** Warnings for hotkeys that could not be registered (duplicate, reserved, taken...). */
export function HotkeyFailures({ failures }) {
  const t = useT();
  if (!Array.isArray(failures) || !failures.length) return null;
  return (
    <Note tone="warn">
      {failures.map((f) => (
        <span key={`${f.action}-${f.accel}`} className="pa-block">
          {t(`premiumAudio.hotkeys.reason.${f.reason}`, {
            action: t(`premiumAudio.hotkeys.actions.${f.action}`),
            accel: f.accel,
            other: f.other ? t(`premiumAudio.hotkeys.actions.${f.other}`) : "",
          })}
        </span>
      ))}
    </Note>
  );
}

export const HOTKEY_ACTIONS = Object.freeze([
  { action: "toggle_mute", feature: "global_mute" },
  { action: "toggle_deafen", feature: "global_mute" },
  { action: "push_to_talk", feature: "global_ptt", hold: true },
  { action: "quick_launcher", feature: "quick_launcher" },
  { action: "volume_up", feature: "per_user_volume_hotkeys" },
  { action: "volume_down", feature: "per_user_volume_hotkeys" },
]);

export const DEFAULT_BINDINGS = Object.freeze({
  toggle_mute: "CommandOrControl+Alt+M",
  toggle_deafen: "CommandOrControl+Alt+D",
  push_to_talk: "Mouse4",
  quick_launcher: "CommandOrControl+Shift+K",
  volume_up: "CommandOrControl+Alt+Up",
  volume_down: "CommandOrControl+Alt+Down",
});
