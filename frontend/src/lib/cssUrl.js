/**
 * Safe CSS `url("…")` for an image address (server audit DF-3). A stored value with a
 * quote, bracket or backslash could close the url() and add a second background layer
 * from any host (IP / view tracking on invite previews). Only https, same-origin paths,
 * blob: and data:image URLs pass; the characters that could break out are escaped.
 * Returns "none" for anything else.
 */
export function cssUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "none";
  const lower = raw.toLowerCase();
  const ok =
    lower.startsWith("https://") ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(lower) ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:image/") ||
    (raw.startsWith("/") && !raw.startsWith("//"));
  if (!ok) return "none";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return "none";
  const escaped = raw.replace(/["'()\\\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `url("${escaped}")`;
}

export default cssUrl;
