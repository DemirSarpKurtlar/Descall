/* Folder colours (mockup 23 "Klasör rengi"). Folders have no colour column server-side,
 * so the choice lives on this device. */
const KEY = "descall.folderColors.v1";
export const FOLDER_COLORS = ["#587AF6", "#30B458", "#F08A24", "#E9B10C", "#F0453A", "#E8457A", "#9B5DE5", "#1AA6B7"];
function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}
export function getFolderColor(folderId) {
  return readAll()[String(folderId)] || null;
}
export function setFolderColor(folderId, color) {
  const all = readAll();
  if (color) all[String(folderId)] = color; else delete all[String(folderId)];
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("descall:folder-colors")); } catch { /* ignore */ }
}
