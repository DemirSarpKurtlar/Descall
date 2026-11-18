/**
 * Language hint for user-provided names (server, category, channel, folder, role,
 * member) that the UI shows with CSS `text-transform: uppercase`.
 *
 * Under <html lang="tr"> the browser uppercases "i" to "İ", so an English category
 * "community" rendered as "COMMUNİTY" (owner report). Names are user content in any
 * language: a name with Turkish-only letters keeps Turkish casing ("istanbul ğece" ->
 * "İSTANBUL ĞECE"); a name with only the shared letters ç/ö/ü counts as Turkish while
 * the app itself is in Turkish; anything else gets the neutral "und" casing ("I").
 */
const TR_ONLY = /[ğĞşŞıİ]/;
const TR_SHARED = /[çÇöÖüÜ]/;

function appLang() {
  try {
    return String(globalThis.document?.documentElement?.lang || "").toLowerCase();
  } catch {
    return "";
  }
}

export function userTextLang(text, uiLang = appLang()) {
  const s = String(text ?? "");
  if (TR_ONLY.test(s)) return "tr";
  if (TR_SHARED.test(s) && String(uiLang || "").toLowerCase().startsWith("tr")) return "tr";
  return "und";
}

export default userTextLang;
