import { IconMic, IconMonitor } from "../icons";

const SHOTS = {
  chat: { src: "brand/previews/02-dm.webp", width: 1440, height: 900 },
  servers: { src: "brand/previews/06-server.webp", width: 1440, height: 900 },
  call: { src: "brand/previews/09-server-voice.webp", width: 1440, height: 900 },
  lfg: { src: "brand/previews/11-friends.webp", width: 1440, height: 900 },
};

/**
 * Approved desktop app screenshot inside the public glass device frame.
 * `frame="flat"` is the servers panel; the home hero tilts and floats chips.
 */
export default function SeoProductPreview({
  caption = "Descall — chat, voice, and LFG in one lighter app",
  mode = "chat",
  frame = "tilt",
  chips = false,
  priority = false,
  chipScreen = "Screen share",
  chipVoice = "Voice · Lobby",
}) {
  const kind = SHOTS[mode] ? mode : "chat";
  const shot = SHOTS[kind];
  const src = `${import.meta.env.BASE_URL}${shot.src}`;
  const tilted = frame !== "flat";

  return (
    <figure className={`seo-product-preview seo-pp-is-${kind}${tilted ? " is-tilt" : " is-flat"}`} aria-label={caption}>
      <div className="seo-device-wrap">
        {tilted ? <div className="seo-device-halo" aria-hidden /> : null}
        <div className="seo-device">
          <div className="seo-device-scr">
            <img
              src={src}
              alt=""
              width={shot.width}
              height={shot.height}
              decoding="async"
              loading={priority ? "eager" : "lazy"}
            />
          </div>
        </div>
        {chips ? (
          <>
            <div className="seo-float-chip is-voice">
              <span className="seo-float-ico is-green" aria-hidden>
                <IconMic size={16} />
              </span>
              {chipVoice}
            </div>
            <div className="seo-float-chip is-share">
              <span className="seo-float-ico is-blue" aria-hidden>
                <IconMonitor size={16} />
              </span>
              {chipScreen}
            </div>
          </>
        ) : null}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
