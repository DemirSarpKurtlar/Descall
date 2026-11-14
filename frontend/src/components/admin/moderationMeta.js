/**
 * GET /admin/moderation/meta (categories, ban and timeout presets), fetched once
 * per page and shared by the ban dialog and the İtirazlar tab.
 */
import { adminFetch } from "../../api/adminHttp";
import { FEATURED_CATEGORIES } from "./banDialogModel.js";

const EMPTY = Object.freeze({ categories: [], timeoutPresets: [], banPresets: [] });
let pending = null;

export function loadModerationMeta() {
  if (!pending) {
    pending = adminFetch("/moderation/meta")
      .then((m) => ({ ...EMPTY, ...(m || {}) }))
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Seed the cache with meta another screen already loaded (AdminModeration). */
export function primeModerationMeta(meta) {
  if (meta && Array.isArray(meta.categories) && meta.categories.length) pending = Promise.resolve({ ...EMPTY, ...meta });
}

/** Display label of a moderation category id (short draft labels for the featured pills). */
export function categoryLabel(id, categories, t) {
  if (!id) return "";
  if (FEATURED_CATEGORIES.includes(id)) return t(`banAdmin.cat.${id}`);
  const cat = (categories || []).find((c) => c?.id === id);
  if (cat?.label) return t(cat.label);
  return id === "other" ? t("Other") : String(id);
}
