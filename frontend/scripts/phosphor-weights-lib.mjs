/**
 * performance-09: every Phosphor icon module ships six weights (thin, light, regular,
 * bold, fill, duotone). Descall only renders regular, bold and fill (components/ui/Icon.jsx
 * maps anything else to regular), so the build drops the other three from each
 * `@phosphor-icons/react/dist/defs/<Icon>.es.js` Map. vendor-phosphor: ~860 KB -> ~430 KB.
 */
export const KEEP_WEIGHTS = Object.freeze(["regular", "bold", "fill"]);
export const DROP_WEIGHTS = Object.freeze(["thin", "light", "duotone"]);

/** Index of the "]" that closes the "[" at `open`, skipping string literals. */
function matchBracket(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return i;
  }
  return -1;
}

/** Remove the `[ "<weight>", <element> ]` entries of the dropped weights. Unchanged on any doubt. */
export function stripPhosphorWeights(src, drop = DROP_WEIGHTS) {
  let out = src;
  for (const w of drop) {
    const re = new RegExp(`\\[\\s*"${w}",`);
    const m = re.exec(out);
    if (!m) continue;
    const end = matchBracket(out, m.index);
    if (end < 0) return src;
    let stop = end + 1;
    const after = /^\s*,/.exec(out.slice(stop));
    if (after) stop += after[0].length;
    out = out.slice(0, m.index) + out.slice(stop);
  }
  // Keep a valid Map literal: drop a trailing comma left before "])".
  out = out.replace(/,(\s*\]\s*\))/g, "$1");
  return out;
}

export function phosphorWeightsPlugin() {
  return {
    name: "descall-phosphor-weights",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/][^\\/]+\.es\.js$/.test(id)) return null;
      const next = stripPhosphorWeights(code);
      return next === code ? null : { code: next, map: null };
    },
  };
}
