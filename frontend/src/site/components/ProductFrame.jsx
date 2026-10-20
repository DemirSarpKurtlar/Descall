/**
 * Real app screen in a heavy frosted glass frame (approved 2026-10-19,
 * ai-look 01-landing-hero-desktop + 05-mobile-landing). One element: above
 * 768 px it is the desktop window, at 768 px and below the same figure becomes
 * a portrait phone frame (38 px corner, concentric inner screen) and <picture>
 * swaps in the iPhone screen. No tilt, no halo, no floating chips.
 */
const FRAMES = {
  chats: {
    desktop: { src: "brand/previews/hero-desktop-dm.webp", width: 1440, height: 900 },
    phone: { src: "brand/previews/hero-ios-chats.webp", width: 780, height: 1688 },
  },
  dm: {
    desktop: { src: "brand/previews/09-server-voice.webp", width: 1440, height: 900 },
    phone: { src: "brand/previews/hero-ios-dm.webp", width: 780, height: 1688 },
  },
};

export default function ProductFrame({ kind = "chats", alt = "", priority = false }) {
  const f = FRAMES[kind] || FRAMES.chats;
  const base = import.meta.env.BASE_URL;
  return (
    <figure className={`mkt-pf mkt-pf-${kind}`}>
      <div className="mkt-pf-glass">
        <picture>
          <source media="(max-width: 768px)" srcSet={`${base}${f.phone.src}`} width={f.phone.width} height={f.phone.height} />
          <img
            className="mkt-pf-screen"
            src={`${base}${f.desktop.src}`}
            width={f.desktop.width}
            height={f.desktop.height}
            alt={alt}
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            fetchpriority={priority ? "high" : undefined}
          />
        </picture>
      </div>
    </figure>
  );
}
