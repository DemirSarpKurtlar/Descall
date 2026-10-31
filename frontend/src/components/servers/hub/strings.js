/* Name helpers for the server sheets. The copy itself lives in the i18n catalogs
 * (i18n/locales/svh.{en,tr}.js, keys svh.<key>, read through useSvh.js). */
import { trDative, trGenitive, trAccusative } from "../../../lib/trSuffix.js";

const VOW = "aeıioöuü";
const lowerTr = (s) => String(s || "").replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
/** "Müzik Kulübü" → "Müzik Kulübü'nden", "Oyun Gecesi" → "Oyun Gecesi'nden", "Kod" → "Kod'dan". */
export function trAblative(name) {
  const printed = String(name || "").trim();
  if (!printed) return "";
  const sound = lowerTr(printed.replace(/[^\p{L}\p{N}]+$/u, ""));
  let v = "";
  for (let i = sound.length - 1; i >= 0; i -= 1) if (VOW.includes(sound[i])) { v = sound[i]; break; }
  const a = v && "aıou".includes(v) ? "a" : "e";
  const last = sound.slice(-1);
  if (VOW.includes(last)) return isPossessiveCompound(printed) ? `${printed}'nd${a}n` : `${printed}'d${a}n`;
  return `${printed}'${"fstkçşhp".includes(last) ? "t" : "d"}${a}n`;
}

/** Multi-word names ending in a possessive vowel ("Oyun Gecesi", "Müzik Kulübü") take the
 * pronominal n: "Oyun Gecesi'ne", "Müzik Kulübü'nü". Single words keep the y buffer ("Ali'ye"). */
function isPossessiveCompound(name) {
  const words = String(name || "").trim().split(/\s+/);
  if (words.length < 2) return false;
  const w = lowerTr(words[words.length - 1]);
  return /[\p{L}]{2,}[ıiuü]$/u.test(w);
}
function harmonyA(name) {
  const sound = lowerTr(name);
  for (let i = sound.length - 1; i >= 0; i -= 1) if (VOW.includes(sound[i])) return "aıou".includes(sound[i]) ? "a" : "e";
  return "e";
}
function fourWay(name) {
  const sound = lowerTr(name);
  for (let i = sound.length - 1; i >= 0; i -= 1) {
    const v = sound[i];
    if (!VOW.includes(v)) continue;
    if ("aı".includes(v)) return "ı";
    if ("ei".includes(v)) return "i";
    if ("ou".includes(v)) return "u";
    return "ü";
  }
  return "i";
}
export function trDativeName(name) {
  const n = String(name || "").trim();
  return isPossessiveCompound(n) ? `${n}'n${harmonyA(n)}` : trDative(n);
}
export function trAccusativeName(name) {
  const n = String(name || "").trim();
  return isPossessiveCompound(n) ? `${n}'n${fourWay(n)}` : trAccusative(n);
}

/**
 * Case-aware name helpers for the Turkish case variants the catalogs use ({serverDat},
 * {targetAcc}, {nameGen}, {serverAbl}). Other languages keep the name as written; their
 * messages use the base variable ({server}, {target}, {name}).
 */
export function caseHelpers(locale) {
  const tr = locale === "tr";
  const same = (n) => String(n ?? "");
  return {
    dat: tr ? trDativeName : same,
    gen: tr ? trGenitive : same,
    acc: tr ? trAccusativeName : same,
    abl: tr ? trAblative : same,
  };
}
