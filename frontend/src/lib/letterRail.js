/**
 * Country shop A–Z rail. When the rail is taller than the space it can stick
 * in (a short window, the settings card on a 600px-high Electron window), it
 * is condensed the way the iOS index rail is: evenly spaced letters with a
 * dot between each pair. A dot jumps to the letter halfway between its
 * neighbours. The first and last letters are always kept.
 *
 * @param {string[]} letters every letter that has a group, in order
 * @param {number} capacity how many rows fit (Infinity = no limit)
 * @returns {{ label: string, letter: string, dot: boolean }[]}
 */
export function condenseLetters(letters, capacity) {
  const list = Array.isArray(letters) ? letters.filter(Boolean) : [];
  const cap = Number.isFinite(capacity) ? Math.floor(capacity) : Infinity;
  if (list.length <= cap) return list.map((l) => ({ label: l, letter: l, dot: false }));
  // Odd slot count: letter, dot, letter, …, letter. At least 3 slots.
  const slots = Math.max(3, cap % 2 ? cap : cap - 1);
  const keep = (slots + 1) / 2;
  const idx = [];
  for (let i = 0; i < keep; i += 1) idx.push(Math.round((i * (list.length - 1)) / (keep - 1)));
  const out = [];
  idx.forEach((at, i) => {
    if (i > 0) {
      const prev = idx[i - 1];
      if (at - prev > 1) {
        const mid = list[Math.round((prev + at) / 2)];
        out.push({ label: "•", letter: mid, dot: true });
      }
    }
    out.push({ label: list[at], letter: list[at], dot: false });
  });
  return out;
}

/** Rows that fit: rail height budget / row height, minus the rail padding. */
export function railCapacity({ available, rowHeight = 16, padding = 12 }) {
  const h = Number(available) - padding;
  if (!Number.isFinite(h)) return Infinity;
  return Math.max(3, Math.floor(h / rowHeight));
}
