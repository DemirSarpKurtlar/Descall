/**
 * İşlem kaydı text: the model's keys turned into words with the page's t().
 * Pure (t is passed in), tested by audit.selftest.mjs with the real catalogs.
 */
import { actionInfo, detailBits, relTime, sentenceOf } from "./auditModel.js";

/** "@demir, @kaan'ı 7 gün yasakladı" */
export function sentenceText(entry, users, servers, t, locale = "tr") {
  const s = sentenceOf(entry, users, servers, { locale, systemLabel: t("auditLog.systemActor") });
  const dur = s.durKey ? t(s.durKey, { n: s.durN }) : "";
  if (entry?.action === "access_denied" && s.vars.value) {
    const key = `auditLog.sec.${s.vars.value}`;
    const label = t(key);
    if (label && label !== key) s.vars.value = label;
  }
  if (s.key === "auditLog.s._generic") {
    return t(s.key, { ...s.vars, dur, label: t(s.labelKey), code: entry?.action || "" });
  }
  return t(s.key, { ...s.vars, dur });
}

/** "30 dk" / "Dün" / "şimdi" */
export function relText(at, now, t) {
  const r = relTime(at, now);
  return t(r.key, { n: r.n });
}

/**
 * The "Ayrıntı" line: bits joined with " · ".
 * @param {(id: string) => string} catLabel moderation category label
 */
export function detailText(entry, t, catLabel, ctx = {}) {
  return detailBits(entry, ctx)
    .map((b) => {
      if (b.text) return b.text;
      if (b.category) return catLabel(b.category);
      return t(b.key, b.vars);
    })
    .filter((x, i, a) => x && a.findIndex((y) => String(y).toLocaleLowerCase() === String(x).toLocaleLowerCase()) === i)
    .join(" · ");
}

/** Action label ("Yasakladı"), or the family / category label for an unknown code. */
export function actionLabel(entry, t) {
  return t(actionInfo(entry?.action, entry?.category).labelKey);
}
