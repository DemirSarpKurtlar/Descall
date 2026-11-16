"use strict";

/**
 * The 16 Market 2.0 set themes (shared with the catalog agents: every set has exactly one piece
 * in each of the 8 SET_PIECE_CATEGORIES, matched by `set_key`). These are the defaults a set
 * starts from; admins can rename, reschedule, re-price or restock a set in shop2_sets.
 */

const SET_PIECE_CATEGORIES = [
  "avatar_frame",
  "banner",
  "profile_color",
  "profile_badge",
  "avatar_effect",
  "chat_bubble",
  "voice_tile",
  "join_sound",
];

/** Piece groups shown together in the set page ("frame + banner", ...). */
const PIECE_GROUPS = [
  ["look", ["avatar_frame", "banner"]],
  ["name", ["profile_color", "profile_badge"]],
  ["motion", ["avatar_effect", "chat_bubble"]],
  ["voice", ["voice_tile", "join_sound"]],
];

// Theme names in the 7 app languages live in backend/i18n/shop2.js (server copy).
const NAMES = require("../../i18n/shop2").themeNames;

const THEMES = [
  { key: "gece-limani", palette: ["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"], name: NAMES["gece-limani"] },
  { key: "bakir-kervan", palette: ["#2a140a", "#b5622b", "#f0a443", "#ffe2b0"], name: NAMES["bakir-kervan"] },
  { key: "orkide-sisi", palette: ["#1d0f2e", "#8b3fd1", "#ff6fb5", "#c8ff6a"], name: NAMES["orkide-sisi"] },
  { key: "kor-bahcesi", palette: ["#1a0705", "#a3220f", "#ff6a2b", "#ffd27a"], name: NAMES["kor-bahcesi"] },
  { key: "buzul-sessizligi", palette: ["#071a24", "#3a8fb7", "#a6e7ff", "#ffffff"], name: NAMES["buzul-sessizligi"] },
  { key: "neon-carsi", palette: ["#0a0618", "#ff2e88", "#2ef2ff", "#fff04a"], name: NAMES["neon-carsi"] },
  { key: "altin-hasat", palette: ["#1b1405", "#8a6a12", "#f2c230", "#fff3c4"], name: NAMES["altin-hasat"] },
  { key: "mor-sis", palette: ["#120a24", "#4b2a9c", "#a77bff", "#e6dcff"], name: NAMES["mor-sis"] },
  { key: "gece-mercani", palette: ["#0c0a1f", "#d6336c", "#ff8fab", "#7c5cff"], name: NAMES["gece-mercani"] },
  { key: "kuzey-isigi", palette: ["#04121c", "#14a37f", "#6effc7", "#8f7bff"], name: NAMES["kuzey-isigi"] },
  { key: "zumrut-orman", palette: ["#06140c", "#1f7a46", "#49d17d", "#d8ffe6"], name: NAMES["zumrut-orman"] },
  { key: "kum-saati", palette: ["#1f160c", "#9c7a4a", "#e8cf9a", "#fff8e8"], name: NAMES["kum-saati"] },
  { key: "firtina-cekirdegi", palette: ["#0a0d14", "#3b4a6b", "#7aa7ff", "#f5f9ff"], name: NAMES["firtina-cekirdegi"] },
  { key: "lav-akisi", palette: ["#120404", "#5a0e0e", "#ff3d00", "#ffb000"], name: NAMES["lav-akisi"] },
  { key: "inci-kiyisi", palette: ["#0e1418", "#6b8a9a", "#f1e9e1", "#ffd8e4"], name: NAMES["inci-kiyisi"] },
  { key: "yildiz-tozu", palette: ["#05030f", "#2b1f6e", "#c6b7ff", "#ffe9a8"], name: NAMES["yildiz-tozu"] },
];

const THEME_BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

const SET_KEY_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

module.exports = { SET_PIECE_CATEGORIES, PIECE_GROUPS, THEMES, THEME_BY_KEY, SET_KEY_RE };
