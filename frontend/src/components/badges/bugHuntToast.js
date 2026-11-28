/* Bug Avcısı live toast copy (pure, bugHunter.render.selftest.mjs). `p` is the server's
   feedback:bughunt payload: { feedbackId, entry: { event, level, badge, reward }, badge, reward }. */
import { ROMAN } from "../../lib/bugHunterText.js";

export function bugHuntToast(p, t, nameOf) {
  const e = p?.entry || {};
  if (e.event === "fixed") return { id: null, text: t("bhunt.toastFixed") };
  if (e.event === "also") return { id: null, text: t("bhunt.toastAlso", { amount: Number(p.reward) || 0 }) };
  const level = Math.max(1, Math.min(3, Number(e.level) || 1));
  const badge = `${nameOf("bughunter")} ${ROMAN[level]}`;
  return { id: e.badge && e.badge !== "none" ? "bughunter" : null, level, text: t("bhunt.toastUser", { badge, amount: Number(p.reward) || 0 }) };
}
