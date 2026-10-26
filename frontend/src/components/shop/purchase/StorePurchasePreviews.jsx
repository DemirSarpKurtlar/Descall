// Category previews for the store purchase modal (approved mockups 2026-10-19).
// Every preview renders the real cosmetic classes (cosmetic-*, effect-*, bubble-*,
// flare-*, aura-*, typing-*, burst-chip-*, overlay-*, [data-theme]) so what the modal
// shows is what the app draws. `item` null means "nothing worn" (the Şu an side).
import { Mic, MonitorUp, PhoneOff, Plus, ShieldCheck, SmilePlus, Video } from "../../ui/Icon.jsx";
import { CountryBadge } from "../CountryFlag";

// Absolute path: the Electron build uses base "./", which would resolve under /settings/.
const BASE = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
const SYMBOL_SRC = `${BASE.startsWith("/") ? BASE : "/"}brand/descall-symbol.svg`;
const DEFAULT_BANNER = "linear-gradient(120deg,#3b2a6e,#5a4bd8 60%,#7d97ff)";
const keyOf = (item) => item?.effect_key || "";
const imgOf = (item) => item?.preview_url || item?.asset_url || "";
const cssUrl = (src) => (src ? `url("${String(src).replace(/"/g, "%22")}")` : "");

export function Av({ me, letter, alt = "", className = "", style, children }) {
  const src = me?.avatarUrl || me?.avatar_url || "";
  const l = letter || String(me?.displayName || me?.display_name || me?.username || "D").trim().charAt(0).toLocaleUpperCase("tr") || "D";
  return (
    <span className={`spm-av ${className}`.trim()} style={style}>
      {children}
      <span className="spm-face">{src && !letter ? <img src={src} alt={alt} draggable={false} /> : l}</span>
    </span>
  );
}

export function meNames(me) {
  const username = me?.username || "descall";
  return { name: me?.displayName || me?.display_name || username, at: `@${username}` };
}

function BadgeRow({ me, c }) {
  return (
    <div className="spm-badge-row">
      {me?.equippedCountry ? <span className="spm-bdg spm-bdg-country"><CountryBadge user={me} special={false} /></span> : null}
      {me?.isAdmin ? (
        <span className="spm-bdg spm-admin"><ShieldCheck size={11} />{c.locale === "tr" ? "YÖNETİCİ" : "ADMIN"}</span>
      ) : null}
    </div>
  );
}

function AvatarEffect({ item, delay }) {
  if (!item) return null;
  return <span className={`cosmetic-avatar-effect effect-${keyOf(item)}`} style={delay ? { animationDelay: delay } : undefined} />;
}
function Name({ item, children }) {
  if (!item) return <span>{children}</span>;
  return <span className={`cosmetic-name-effect effect-${keyOf(item)}`}>{children}</span>;
}

const S = {
  banner({ item, me, c }) {
    const { name, at } = meNames(me);
    const src = imgOf(item);
    return (
      <div className="spm-stage spm-flat">
        <div className="spm-pcard spm-pc">
          <div className="spm-bn" style={{ backgroundImage: src ? cssUrl(src) : DEFAULT_BANNER }} />
          <div className="spm-bd">
            <Av me={me}><span className="status-badge spm-sb-lg" /></Av>
            <div className="spm-nm">{name}</div>
            <div className="spm-at">{at}</div>
            <BadgeRow me={me} c={c} />
          </div>
        </div>
      </div>
    );
  },
  avatar_effect({ item, me, c }) {
    const { name } = meNames(me);
    return (
      <div className="spm-stage">
        <div className="spm-ae">
          <div className="spm-big"><Av me={me}><AvatarEffect item={item} delay="-1.4s" /></Av></div>
          <div className="spm-list">
            <div className="spm-where">
              <div className="spm-cap2">{c.inMessages}</div>
              <div className="spm-msg">
                <Av me={me} className="spm-av-34"><AvatarEffect item={item} delay="-3.1s" /></Av>
                <div className="spm-body"><div className="spm-h">{name} <time>{c.lines.today} 17:35</time></div><p>{c.lines.ae}</p></div>
              </div>
            </div>
            <div className="spm-where">
              <div className="spm-cap2">{c.inMembers}</div>
              <div className="spm-mem spm-hl spm-mem-30"><Av me={me} className="spm-av-26"><AvatarEffect item={item} delay="-4.6s" /></Av> {name}</div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  profile_background({ item, me, c }) {
    const { name, at } = meNames(me);
    const src = imgOf(item);
    return (
      <div className="spm-stage spm-flat">
        <div className={`spm-pcard spm-bgcard${src ? "" : " is-empty"}`} style={src ? { backgroundImage: cssUrl(src) } : undefined}>
          <div className="spm-in">
            <Av me={me} />
            <div>
              <div className="spm-nm">{name}</div>
              <div className="spm-at">{at}</div>
              <div className="spm-about">{me?.bio || c.lines.bgAbout}</div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  theme({ item, me, c, currentThemeKey }) {
    const key = item ? item.theme_key || "dark" : currentThemeKey || "dark";
    const { name } = meNames(me);
    return (
      <div className="spm-stage">
        <div className="spm-app" data-theme={key}>
          <div className={`spm-scene shop-theme-swatch theme-${key}`} />
          <div className="spm-rail"><img className="spm-rail-logo" src={SYMBOL_SRC} alt="" draggable={false} /><i className="on" /><i /><i /><i /></div>
          <div className="spm-list2">
            <div className="spm-t">{c.dms}</div>
            <div className="spm-r on"><Av letter="S" className="spm-a2" /> Selin</div>
            <div className="spm-r"><Av letter="E" className="spm-a3" /> Ece</div>
            <div className="spm-r"><Av letter="K" className="spm-a4" /> Kaan</div>
            <div className="spm-r"><Av letter="A" /> {c.eveningGroup}</div>
          </div>
          <div className="spm-chat">
            <div className="spm-hd"><Av letter="S" className="spm-a2 spm-av-20" /> Selin <span className="spm-hd-on">{c.online}</span></div>
            <div className="spm-b">{c.lines.theme1}</div>
            <div className="spm-b me">{c.lines.theme2}</div>
            <div className="spm-b">{c.lines.theme3}</div>
            <div className="spm-comp">{c.sendTo("Selin")}</div>
          </div>
          <span className="spm-sr">{name}</span>
        </div>
      </div>
    );
  },
  name_effect({ item, me, c }) {
    const { name, at } = meNames(me);
    return (
      <div className="spm-stage">
        <div className="spm-nb">
          <div className="spm-top"><Av me={me} /><div><div className="spm-nm"><Name item={item}>{name}</Name></div><div className="spm-at">{at}</div></div></div>
          <div className="spm-bot">
            <div className="spm-where"><div className="spm-cap2">{c.chat15}</div>
              <div className="spm-msg"><Av me={me} className="spm-mini-av" /><div className="spm-body"><div className="spm-h spm-h15"><Name item={item}>{name}</Name><time>17:35</time></div><p>{c.lines.name}</p></div></div></div>
            <div className="spm-where"><div className="spm-cap2">{c.members13}</div>
              <div className="spm-mem spm-hl spm-mem-32"><Av me={me} className="spm-av-24" /> <Name item={item}>{name}</Name></div></div>
          </div>
        </div>
      </div>
    );
  },
  chat_bubble({ item, c }) {
    const cls = item ? `message-bubble cosmetic-chat-bubble bubble-${keyOf(item)}` : "message-bubble spm-cb-default";
    return (
      <div className="spm-stage">
        <div className="spm-conv">
          <div className="spm-who"><Av letter="S" className="spm-a2" /> Selin</div>
          <div className="spm-cb them">{c.lines.bub1}<time>21:02</time></div>
          <div className={`spm-cb me ${cls}`}><span className="message-text">{c.lines.bub2}</span><time>21:03</time></div>
          <div className={`spm-cb me ${cls}`}><span className="message-text">{c.lines.bub3}</span><time>21:03</time></div>
        </div>
      </div>
    );
  },
  presence_flare({ item, me, c }) {
    const { name } = meNames(me);
    const fl = item ? ` cosmetic-presence-flare flare-${keyOf(item)}` : "";
    return (
      <div className="spm-stage">
        <div className="spm-pr">
          <div className="spm-big"><Av me={me}><span className={`status-badge${fl}`} /></Av></div>
          <div className="spm-pr-list">
            <div className="spm-where"><div className="spm-cap2">{c.inDms}</div>
              <div className="spm-mem spm-hl spm-mem-pr"><Av me={me} className="spm-av-28"><span className={`status-badge spm-sb-sm${fl}`} /></Av> {name}<span className="spm-on-txt">{c.online}</span></div></div>
            <div className="spm-where"><div className="spm-cap2">{c.statesStay}</div>
              <div className="spm-st-row">
                <span><i className={fl.trim()} style={{ background: "#23a55a" }} />{c.online}</span>
                <span><i className={fl.trim()} style={{ background: "#f0b232" }} />{c.idle}</span>
                <span><i className={fl.trim()} style={{ background: "#f23f43" }} />{c.dnd}</span>
              </div></div>
          </div>
        </div>
      </div>
    );
  },
  profile_aura({ item, me, c, compact }) {
    const { name, at } = meNames(me);
    const au = item ? ` cosmetic-profile-aura aura-${keyOf(item)}` : "";
    return (
      <div className="spm-stage spm-flat spm-aura-stage">
        <div className={`spm-pcard spm-pc spm-pc-aura${au}`}>
          <div className="spm-bn" style={{ height: compact ? 70 : 84, background: DEFAULT_BANNER }} />
          <div className="spm-bd"><Av me={me} /><div className="spm-nm">{name}</div><div className="spm-at">{at}</div><BadgeRow me={me} c={c} /></div>
        </div>
      </div>
    );
  },
  typing_flare({ item, me, c }) {
    const { name } = meNames(me);
    const k = keyOf(item);
    return (
      <div className="spm-stage">
        <div className="spm-ty">
          <div className="spm-msg"><Av letter="S" className="spm-a2 spm-mini-av" /><div className="spm-body"><div className="spm-h">Selin <time>21:10</time></div><p>{c.lines.ty1}</p></div></div>
          <div className="spm-msg"><Av me={me} className="spm-mini-av" /><div className="spm-body"><div className="spm-h">{name} <time>21:11</time></div><p>{c.lines.ty2}</p></div></div>
          <div className={`typing-indicator-shell${item ? ` typing-shell-${k}` : ""}`}>
            <Av me={me} />
            <span className={`cosmetic-typing-flare${item ? ` typing-${k}` : ""}`}><i className="typing-dot" /><i className="typing-dot" /><i className="typing-dot" /></span>
            <span><b>{name}</b> {c.typing}</span>
          </div>
          <div className="spm-composer"><Plus className="spm-ic" /> {c.sendTo("Selin")}</div>
        </div>
      </div>
    );
  },
  reaction_burst({ item, c }) {
    const bc = item ? ` burst-chip-${keyOf(item)}` : "";
    return (
      <div className="spm-stage">
        <div className="spm-rx-wrap">
          <div>
            <div className="spm-msg"><Av letter="S" className="spm-a2 spm-av-36" />
              <div className="spm-body"><div className="spm-h">Selin <time>21:14</time></div>
                <p>{c.lines.rx}</p>
                <div className="spm-rxs">
                  <span className={`spm-rx spm-mine${bc}`}><span className="spm-emoji">🔥</span>3</span>
                  <span className="spm-rx"><span className="spm-emoji">😂</span>1</span>
                  <span className="spm-rx"><span className="spm-emoji">👍</span>2</span>
                  <span className="spm-rx spm-add"><SmilePlus className="spm-ic" /></span>
                </div>
              </div>
            </div>
          </div>
          <div className="spm-zoom">
            {item ? <div className="spm-spec" /> : null}
            <span className={`spm-rx spm-mine${bc}`}><span className="spm-emoji">🔥</span>3</span>
            <span className="spm-cap">{c.clickMoment}</span>
          </div>
        </div>
      </div>
    );
  },
  call_overlay({ item, me }) {
    const { name } = meNames(me);
    const ov = item ? ` cosmetic-call-overlay overlay-${keyOf(item)}` : "";
    return (
      <div className="spm-stage">
        <div className={`spm-call${ov}`}>
          <div className="spm-tiles">
            <div className="spm-tl speak"><Av me={me} /><span className="spm-tag"><Mic className="spm-ic" /> {name}</span></div>
            <div className="spm-tl"><Av letter="S" className="spm-a2" /><span className="spm-tag">Selin</span></div>
          </div>
          <div className="spm-ccb">
            <span><Mic className="spm-ic" /></span><span><Video className="spm-ic" /></span><span><MonitorUp className="spm-ic" /></span>
            <span className="end"><PhoneOff className="spm-ic" /></span>
          </div>
        </div>
      </div>
    );
  },
};

export function PurchasePreview({ category, ...rest }) {
  const P = S[category];
  return P ? <P {...rest} /> : null;
}

/** The 104px (72px on the sheet) hero tile: always the item being bought. */
export function PurchaseThumb({ category, item, me }) {
  const k = keyOf(item);
  switch (category) {
    case "banner":
    case "profile_background":
      return <div className="spm-th-banner" style={{ backgroundImage: cssUrl(imgOf(item)) || DEFAULT_BANNER }} />;
    case "avatar_effect":
      return <div className="spm-th-av"><Av me={me}><AvatarEffect item={item} delay="-2.2s" /></Av></div>;
    case "theme":
      return <div className={`spm-th-swatch shop-theme-swatch theme-${item.theme_key || "default"}`} data-theme-preview={item.theme_key} />;
    case "name_effect":
      return <span className={`spm-th-text cosmetic-name-effect effect-${k}`}>Aa</span>;
    case "chat_bubble":
      return <span className={`spm-th-bubble message-bubble cosmetic-chat-bubble bubble-${k}`}><span className="message-text">Selam!</span></span>;
    case "presence_flare":
      return <span className={`spm-th-dot cosmetic-presence-flare flare-${k}`} />;
    case "profile_aura":
      return <span className={`spm-th-aura cosmetic-profile-aura aura-${k}`} />;
    case "typing_flare":
      return (
        <span className={`typing-indicator-shell spm-th-typing typing-shell-${k}`}>
          <span className={`cosmetic-typing-flare typing-${k}`}><i className="typing-dot" /><i className="typing-dot" /><i className="typing-dot" /></span>
        </span>
      );
    case "reaction_burst":
      return <span className={`spm-rx spm-mine spm-th-rx burst-chip-${k}`}><span className="spm-emoji">🔥</span>3</span>;
    case "call_overlay":
      return <div className={`spm-th-call cosmetic-call-overlay overlay-${k}`}><Av me={me} /><Av letter="S" className="spm-a2" /><div className="spm-th-call-bar" /></div>;
    default:
      return null;
  }
}
