/**
 * Inline message markdown, shared by chat bubbles on every platform (web,
 * Electron, iOS, Android) and by the iOS long-press lifted copy (which is a
 * clone of the rendered bubble).
 *
 * Same rule the web already used for Descall Apps embeds
 * (SlashCommandEmbed `renderInlineMarkdown`): `**text**` is bold, `` `x` `` is
 * inline code. On top of that: @mentions and links (as before), and
 * backslash escapes `\* \_ \` \~ \\` render the literal character (the server
 * escapes poll questions/options this way, slashCommands.js `escapeMd`).
 * Newlines are kept: the bubble's `.message-text` is `white-space: pre-wrap`.
 *
 * Pure: returns tokens; MessageContent maps them to elements.
 *   { type: "text", value }
 *   { type: "code", value }
 *   { type: "mention", value }          value includes the leading "@"
 *   { type: "url", value }
 *   { type: "bold", children: Token[] } inner text is tokenized again
 */

const ESCAPABLE = "\\*_`~";
// Private-use placeholders so an escaped char can never open/close a token.
const SENTINEL_BASE = 0xe000;
const SENTINEL_RE = /[\ue000-\ue004]/g;

function protectEscapes(text) {
  return text.replace(/\\([\\*_`~])/g, (_, ch) => String.fromCharCode(SENTINEL_BASE + ESCAPABLE.indexOf(ch)));
}

export function restoreEscapes(text) {
  return String(text).replace(SENTINEL_RE, (ch) => ESCAPABLE[ch.charCodeAt(0) - SENTINEL_BASE]);
}

const LINK_SRC =
  "(?:https?:\\/\\/|(?:www\\.)?descall\\.(?:com|vercel\\.app)\\/|des-call\\.onrender\\.com\\/)[^\\s<]+[^\\s<.,;:!?'\")\\]]";

// Order matters at the same index: code, bold, mention, link.
const INLINE_RE = new RegExp(`(\`[^\`]+\`)|(\\*\\*[^*]+\\*\\*)|(@[a-zA-Z0-9_]{2,32})|(${LINK_SRC})`, "g");

function tokenizeProtected(text, depth) {
  const out = [];
  if (!text) return out;
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0;
  let m;
  const pushText = (value) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === "text") prev.value += value;
    else out.push({ type: "text", value });
  };
  while ((m = re.exec(text)) !== null) {
    const token = m[0];
    if (m[2] && depth > 0) {
      // No nested bold: treat inner ** literally.
      pushText(text.slice(last, m.index + 2));
      last = m.index + 2;
      re.lastIndex = last;
      continue;
    }
    if (m.index > last) pushText(text.slice(last, m.index));
    if (m[1]) out.push({ type: "code", value: token.slice(1, -1) });
    else if (m[2]) out.push({ type: "bold", children: tokenizeProtected(token.slice(2, -2), depth + 1) });
    else if (m[3]) out.push({ type: "mention", value: token });
    else out.push({ type: "url", value: token });
    last = m.index + token.length;
  }
  if (last < text.length) pushText(text.slice(last));
  return out;
}

function restoreTokens(tokens) {
  for (const t of tokens) {
    if (t.children) restoreTokens(t.children);
    else t.value = restoreEscapes(t.value);
  }
  return tokens;
}

/** Inline tokens for one non-code-block chunk of message text. */
export function tokenizeInline(text) {
  const raw = String(text ?? "");
  if (!raw) return [];
  return restoreTokens(tokenizeProtected(protectEscapes(raw), 0));
}

/**
 * Split message text into fenced ``` code blocks and inline chunks.
 * Escapes are not applied inside code blocks.
 */
export function splitBlocks(text) {
  const raw = String(text ?? "");
  if (!raw) return [];
  return raw
    .split(/(```[\s\S]*?```)/g)
    .filter((b) => b !== "")
    .map((block) =>
      block.length >= 6 && block.startsWith("```") && block.endsWith("```")
        ? { type: "codeblock", value: block.slice(3, -3).replace(/^\n/, "").replace(/\n$/, "") }
        : { type: "inline", value: block }
    );
}

/** Plain text with markdown markers removed (bold markers and escapes). */
export function plainText(text) {
  const flat = (tokens) => tokens.map((t) => (t.children ? flat(t.children) : t.type === "code" ? t.value : t.value)).join("");
  return splitBlocks(text)
    .map((b) => (b.type === "codeblock" ? b.value : flat(tokenizeInline(b.value))))
    .join("");
}
