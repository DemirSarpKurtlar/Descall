import { hapticSuccess } from "./fluid/haptics";

/** Copy text. On the iOS app a success tick follows a real write; web/desktop stay silent. */
export async function copyText(text) {
  const value = String(text ?? "");
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    hapticSuccess();
    return true;
  }
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy failed");
  hapticSuccess();
  return true;
}
