/**
 * Desktop widgets: a "premium:widgets:moved" report from the shell -> the new widget list to
 * save, or null when nothing changed. Electron reports only the user's drags; the Tauri shell
 * also reports the moves it makes itself when it places the widgets. Saving an unchanged
 * position re-applied the layout, which moved the windows again: an endless apply / moved
 * loop every quarter second. Unknown ids and non-numeric positions are ignored too.
 */
export function widgetsAfterMove(list, m) {
  if (!Array.isArray(list) || !m || !m.id) return null;
  const x = Math.round(Number(m.x));
  const y = Math.round(Number(m.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cur = list.find((w) => w && w.id === m.id);
  if (!cur || (cur.x === x && cur.y === y)) return null;
  return list.map((w) => (w === cur ? { ...w, x, y } : w));
}
