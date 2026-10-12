/**
 * Equal-cell grid for a desktop group call while someone is sharing.
 * At most 4 columns, so a 1024px stage shrinks cells instead of overflowing sideways.
 */
export function groupMosaicShape(count) {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (n === 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  const cols = 4;
  return { cols, rows: Math.ceil(n / cols) };
}
