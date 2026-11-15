"use strict";

/**
 * What a message reaction may be (server audit MSG-9): one emoji (one grapheme with a
 * pictographic, regional-indicator or keycap part) or a custom emoji token
 * `<:name:id>` / `<a:name:id>`. Plain text, links, objects and long strings are
 * refused; they used to be stored and broadcast as "reactions".
 */

const MAX_REACTION_LENGTH = 64;
const MAX_DISTINCT_REACTIONS = 20;
const CUSTOM_RE = /^<a?:[A-Za-z0-9_]{1,32}:\d{1,25}>$/;
const EMOJI_PART_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const ALLOWED_CHARS_RE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|\p{Emoji_Presentation}|[‍︎️⃣\u{E0020}-\u{E007F}])+$/u;

let segmenter = null;
function graphemeCount(text) {
  try {
    segmenter = segmenter || new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let n = 0;
    for (const _ of segmenter.segment(text)) n += 1;
    return n;
  } catch {
    return [...text].length <= 2 ? 1 : 2;
  }
}

function isValidReactionEmoji(value) {
  if (typeof value !== "string") return false;
  if (!value || value.length > MAX_REACTION_LENGTH) return false;
  if (CUSTOM_RE.test(value)) return true;
  if (!ALLOWED_CHARS_RE.test(value) || !EMOJI_PART_RE.test(value)) return false;
  return graphemeCount(value) === 1;
}

module.exports = { isValidReactionEmoji, MAX_REACTION_LENGTH, MAX_DISTINCT_REACTIONS };
