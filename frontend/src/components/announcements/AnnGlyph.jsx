import { ANN_SVG, announcementIconKey } from "../../lib/announcementIcons.js";

/** One line icon of the Duyurular set (lib/announcementIcons.js). Decorative unless `title` is given. */
export function AnnGlyph({ name, size = 18, strokeWidth = 2, className = "", style, title }) {
  const inner = ANN_SVG[name] || ANN_SVG.megaphone;
  return (
    <svg
      className={`ann-glyph ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : "true"}
      focusable="false"
      // Static path data from our own icon table, never user input.
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${String(title).replace(/[<&>]/g, "")}</title>` : "") + inner }}
    />
  );
}

/** Coloured square behind an announcement icon (tint of the announcement colour). */
export function AnnTile({ item, icon, color, size = "md", className = "" }) {
  const key = icon || announcementIconKey(item);
  const c = /^#[0-9a-f]{6}$/i.test(String(color || item?.color || "")) ? String(color || item.color) : "#587af5";
  const px = size === "lg" ? 22 : size === "sm" ? 16 : 18;
  return (
    <span className={`ann-tile is-${size} ${className}`.trim()} style={{ "--ann-c": c }} aria-hidden="true">
      <AnnGlyph name={key} size={px} />
    </span>
  );
}
