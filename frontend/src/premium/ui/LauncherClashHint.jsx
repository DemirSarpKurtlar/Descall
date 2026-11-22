import { useT } from "../../context/localeContextInstance";
import { usePremium } from "../usePremium.js";
import { useFeatureSettings } from "../featureSettings.js";
import { isDesktopApp } from "./PremiumAudioKit.jsx";
import { DEFAULTS } from "../gaming/ui.jsx";
import { acceleratorLabel } from "../../lib/desktopTray.js";
import { launcherCommandCenterClash, sameAccel, useCommandCenterHotkeyResult } from "../hotkeyClash.js";
import { Hint } from "../story/kit.jsx";

/**
 * Warning under the quick launcher and command center panels (desktop app only):
 *  - both on with the same shortcut (default Ctrl+Shift+K for both): only one of them gets it;
 *  - `showFailed`: the shell could not register the command center shortcut for another reason.
 */
export default function LauncherClashHint({ ds, showFailed = false }) {
  const t = useT();
  const { has } = usePremium();
  const [launcher] = useFeatureSettings("quick_launcher", { enabled: false });
  const [commandCenter] = useFeatureSettings("command_center", DEFAULTS.command_center);
  const [custom] = useFeatureSettings("custom_hotkeys", { bindings: {} });
  const result = useCommandCenterHotkeyResult();
  if (!isDesktopApp()) return null;
  const clash = launcherCommandCenterClash({ has, launcher, commandCenter, custom });
  if (clash) {
    return <Hint tone="warn" live ds={ds}>{t("premiumGaming.commandCenter.hotkeyClash", { accel: acceleratorLabel(clash) })}</Hint>;
  }
  const want = commandCenter && typeof commandCenter.hotkey === "string" ? commandCenter.hotkey : DEFAULTS.command_center.hotkey;
  if (showFailed && result && !result.ok && sameAccel(result.accel, want) && has("command_center") && commandCenter?.enabled !== false) {
    return <Hint tone="warn" live ds={ds}>{t("premiumGaming.commandCenter.hotkeyFailed", { accel: acceleratorLabel(result.accel) })}</Hint>;
  }
  return null;
}
