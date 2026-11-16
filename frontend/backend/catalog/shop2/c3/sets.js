"use strict";

/** The 16 Market 2.0 set themes (shared by every catalog agent). */
const SETS = [
  { key: "gece-limani", palette: ["#0b1b3a", "#1e4b8f", "#35d0e0", "#e8f6ff"] },
  { key: "bakir-kervan", palette: ["#2a140a", "#b5622b", "#f0a443", "#ffe2b0"] },
  { key: "orkide-sisi", palette: ["#1d0f2e", "#8b3fd1", "#ff6fb5", "#c8ff6a"] },
  { key: "kor-bahcesi", palette: ["#1a0705", "#a3220f", "#ff6a2b", "#ffd27a"] },
  { key: "buzul-sessizligi", palette: ["#071a24", "#3a8fb7", "#a6e7ff", "#ffffff"] },
  { key: "neon-carsi", palette: ["#0a0618", "#ff2e88", "#2ef2ff", "#fff04a"] },
  { key: "altin-hasat", palette: ["#1b1405", "#8a6a12", "#f2c230", "#fff3c4"] },
  { key: "mor-sis", palette: ["#120a24", "#4b2a9c", "#a77bff", "#e6dcff"] },
  { key: "gece-mercani", palette: ["#0c0a1f", "#d6336c", "#ff8fab", "#7c5cff"] },
  { key: "kuzey-isigi", palette: ["#04121c", "#14a37f", "#6effc7", "#8f7bff"] },
  { key: "zumrut-orman", palette: ["#06140c", "#1f7a46", "#49d17d", "#d8ffe6"] },
  { key: "kum-saati", palette: ["#1f160c", "#9c7a4a", "#e8cf9a", "#fff8e8"] },
  { key: "firtina-cekirdegi", palette: ["#0a0d14", "#3b4a6b", "#7aa7ff", "#f5f9ff"] },
  { key: "lav-akisi", palette: ["#120404", "#5a0e0e", "#ff3d00", "#ffb000"] },
  { key: "inci-kiyisi", palette: ["#0e1418", "#6b8a9a", "#f1e9e1", "#ffd8e4"] },
  { key: "yildiz-tozu", palette: ["#05030f", "#2b1f6e", "#c6b7ff", "#ffe9a8"] },
];

const SET_KEYS = SETS.map((s) => s.key);

module.exports = { SETS, SET_KEYS };
