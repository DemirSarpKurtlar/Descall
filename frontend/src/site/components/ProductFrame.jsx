import { PREVIEW_SIZES, previewSrcset } from "../seo/featureGroups.js";

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
  // No iPhone capture of the server screen: the window stays landscape on phones too.
  servers: {
    desktop: { src: "brand/previews/06-server.webp", width: 1440, height: 900 },
    wide: true,
  },
};

/** The 2880 px product shots also come in 1440 / 720 px copies (seo/featureGroups.js). */
const RESPONSIVE = /brand\/previews\/(02-dm|06-server|09-server-voice|11-friends)\.webp$/;

/** Phone frame screen: at most 220 px wide (home-hero.css .mkt-pf-glass, 236 px minus padding). */
const PHONE_SIZES = "min(220px, 60vw)";

export default function ProductFrame({ kind = "chats", alt = "", priority = false }) {
  const f = FRAMES[kind] || FRAMES.chats;
  const base = import.meta.env.BASE_URL;
  return (
    <figure className={`mkt-pf mkt-pf-${kind}${f.wide ? " mkt-pf-wide" : ""}`}>
      <div className="mkt-pf-glass">
        <picture>
          {f.phone ? (
            <source
              media="(max-width: 768px)"
              srcSet={`${base}${f.phone.src.replace(/\.webp$/, "-480.webp")} 480w, ${base}${f.phone.src} 780w`}
              sizes={PHONE_SIZES}
              width={f.phone.width}
              height={f.phone.height}
            />
          ) : null}
          <img
            className="mkt-pf-screen"
            src={`${base}${f.desktop.src}`}
            srcSet={RESPONSIVE.test(f.desktop.src) ? previewSrcset(`${base}${f.desktop.src}`) : undefined}
            sizes={RESPONSIVE.test(f.desktop.src) ? PREVIEW_SIZES : undefined}
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
