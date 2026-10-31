/**
 * Pseudo locale: every catalog string becomes accented, about 30 % longer and wrapped
 * in [[ ]]. Text on screen without the brackets did not go through the catalog, so it
 * would stay untranslated in every language. Placeholders and ICU syntax are kept.
 */

const MAP = {
  a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "í", j: "ĵ", k: "ķ",
  l: "ĺ", m: "ɱ", n: "ñ", o: "ó", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "ú", v: "ṽ",
  w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Í", J: "Ĵ", K: "Ķ",
  L: "Ĺ", M: "Ṁ", N: "Ñ", O: "Ó", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Ú", V: "Ṽ",
  W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

export const PSEUDO_OPEN = "[[";
export const PSEUDO_CLOSE = "]]";

function accent(text) {
  let out = "";
  let letters = 0;
  for (const ch of text) {
    out += MAP[ch] || ch;
    if (MAP[ch]) letters += 1;
  }
  // Pad about 30 % so layouts get tested with longer languages (German, Russian).
  const pad = Math.ceil(letters * 0.3);
  return pad > 0 ? out + "~".repeat(Math.min(pad, 12)) : out;
}

function matchBrace(str, open) {
  let depth = 0;
  for (let i = open; i < str.length; i += 1) {
    if (str[i] === "{") depth += 1;
    else if (str[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const COMPLEX = /^(\s*\w+\s*,\s*(?:plural|selectordinal|select)\s*,)([\s\S]*)$/;

function transform(str) {
  let out = "";
  let text = "";
  let i = 0;
  const flush = () => {
    out += accent(text);
    text = "";
  };
  while (i < str.length) {
    if (str[i] !== "{") {
      text += str[i];
      i += 1;
      continue;
    }
    const end = matchBrace(str, i);
    if (end < 0) {
      text += str.slice(i);
      break;
    }
    flush();
    const inner = str.slice(i + 1, end);
    const cx = COMPLEX.exec(inner);
    if (cx) {
      // Keep selectors, transform each option body.
      let body = cx[2];
      let rebuilt = "";
      let j = 0;
      while (j < body.length) {
        if (body[j] === "{") {
          const e = matchBrace(body, j);
          if (e < 0) {
            rebuilt += body.slice(j);
            break;
          }
          rebuilt += `{${transform(body.slice(j + 1, e))}}`;
          j = e + 1;
        } else {
          rebuilt += body[j];
          j += 1;
        }
      }
      out += `{${cx[1]}${rebuilt}}`;
    } else {
      out += str.slice(i, end + 1);
    }
    i = end + 1;
  }
  flush();
  return out;
}

export function pseudoize(str) {
  if (typeof str !== "string" || !str) return str;
  return `${PSEUDO_OPEN}${transform(str)}${PSEUDO_CLOSE}`;
}
