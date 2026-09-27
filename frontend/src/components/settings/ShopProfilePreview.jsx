import { Flame, Phone, Play, Sparkles, Volume2, Zap } from "lucide-react";
import { Avatar } from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import ParallaxBanner from "../ui/ParallaxBanner";
import AdminBadge from "../social/AdminBadge";
import ValorantBadge from "../social/ValorantBadge";
import { BadgeIcon, NameEffectText, TitleTag, profileAuraClass } from "../ui/Cosmetics";
import { cssUrl } from "../../lib/cssUrl";
import { previewSoundPack } from "../../lib/audioManager";
import { preloadSoundPack } from "../../lib/soundPackSynth";

const EQUIPPED_SLOTS = [
  { id: "banner", label: "Banners", pick: (user) => user?.equippedBanner },
  { id: "avatar_frame", label: "Frames", pick: (user) => user?.equippedAvatarFrame },
  { id: "profile_background", label: "Backgrounds", pick: (user) => user?.equippedBackground },
  { id: "theme", label: "Themes", pick: (user) => user?.equippedTheme },
  { id: "profile_badge", label: "Badges", pick: (user) => user?.equippedBadge },
  { id: "profile_title", label: "Titles", pick: (user) => user?.equippedTitle },
  { id: "name_effect", label: "Name Effects", pick: (user) => user?.equippedNameEffect },
  { id: "avatar_effect", label: "Avatar Effects", pick: (user) => user?.equippedAvatarEffect },
  { id: "chat_bubble", label: "Bubbles", pick: (user) => user?.equippedChatBubble },
  { id: "presence_flare", label: "Presence", pick: (user) => user?.equippedPresenceFlare },
  { id: "profile_aura", label: "Auras", pick: (user) => user?.equippedProfileAura },
  { id: "sound_pack", label: "Sounds", pick: (user) => user?.equippedSoundPack },
  { id: "typing_flare", label: "Typing", pick: (user) => user?.equippedTypingFlare },
  { id: "reaction_burst", label: "Reactions", pick: (user) => user?.equippedReactionBurst },
  { id: "call_overlay", label: "Call Overlays", pick: (user) => user?.equippedCallOverlay },
];

function bannerFallback(username) {
  const seed = String(username || "user").split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const hue = seed % 360;
  return `linear-gradient(135deg, hsl(${hue} 42% 32%), hsl(${(hue + 36) % 360} 46% 16%))`;
}

export default function ShopProfilePreview({ me, t }) {
  const username = me?.username || t("User");
  const displayName = me?.displayName || me?.display_name || username;
  const bannerUrl = me?.equippedBanner?.asset_url || me?.bannerUrl || me?.banner_url || null;
  const backgroundUrl = me?.equippedBackground?.asset_url || null;
  const status = me?.status || "online";
  const customStatus = me?.customStatus || me?.custom_status || "";
  const bio = me?.bio || "";
  const bubble = me?.equippedChatBubble;
  const typing = me?.equippedTypingFlare;
  const reaction = me?.equippedReactionBurst;
  const callOverlay = me?.equippedCallOverlay;
  const sound = me?.equippedSoundPack;
  const statusLabel = {
    online: t("Online"),
    idle: t("Idle"),
    dnd: t("Do Not Disturb"),
    invisible: t("Invisible"),
    offline: t("Offline"),
  }[status] || t("Online");

  return (
    <aside className="shop-profile-stage" aria-label={t("Preview")}>
      <div className="shop-profile-stage-label">{t("Preview")}</div>
      <div
        className={`shop-live-profile user-profile-card ${profileAuraClass(me)}`.trim()}
        style={
          backgroundUrl
            ? {
                background: `linear-gradient(180deg, rgba(12,12,16,0.28) 0%, rgba(12,12,16,0.78) 58%, rgba(12,12,16,0.94) 100%), ${cssUrl(backgroundUrl)} center/cover no-repeat`,
              }
            : undefined
        }
      >
        <ParallaxBanner
          height={92}
          imageUrl={bannerUrl ? cssUrl(bannerUrl) : null}
          fallbackStyle={{ background: bannerFallback(username) }}
          strength={10}
        />
        <div className="shop-live-profile-body">
          <div className="shop-live-avatar profile-avatar-shell">
            <Avatar
              name={displayName}
              size={72}
              user={me || { username }}
              animate="always"
            />
            <StatusBadge status={status === "invisible" ? "offline" : status} user={me} />
          </div>
          <div className="user-profile-identity">
            <div className="user-profile-name-row">
              <NameEffectText user={me}>{displayName}</NameEffectText>
              <BadgeIcon user={me} />
            </div>
            <div className="shop-live-handle">@{String(username).toLowerCase()}</div>
            <div className="user-profile-badges">
              <TitleTag user={me} />
              <AdminBadge user={me} variant="chip" />
            </div>
            <div className="user-profile-status-line">
              <span className={`shop-live-status-dot status-${status}`} />
              {statusLabel}
            </div>
            {customStatus ? <p className="shop-live-status-text">{customStatus}</p> : null}
          </div>
          {bio ? (
            <div className="shop-live-bio">
              <span>{t("Bio")}</span>
              <p>{bio}</p>
            </div>
          ) : null}
          {me?.valorant?.linked ? <ValorantBadge valorant={me.valorant} compact /> : null}
          {(bubble || typing || reaction || callOverlay || sound) && (
            <div className="shop-live-extras">
              {bubble ? (
                <div className={`cosmetic-chat-bubble bubble-${bubble.effect_key} shop-live-bubble`}>
                  {t("Hey there!")}
                </div>
              ) : null}
              {(typing || reaction || callOverlay || sound) && (
                <div className="shop-live-chips">
                  {typing ? (
                    <div className={`shop-typing-flare-preview cosmetic-typing-flare typing-${typing.effect_key}`}>
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  ) : null}
                  {reaction ? (
                    <div className={`shop-reaction-burst-preview cosmetic-reaction-burst burst-${reaction.effect_key}`}>
                      <Flame size={14} />
                      <Zap size={12} />
                    </div>
                  ) : null}
                  {callOverlay ? (
                    <div className={`shop-call-overlay-preview cosmetic-call-overlay overlay-${callOverlay.effect_key}`}>
                      <Phone size={14} />
                    </div>
                  ) : null}
                  {sound ? (
                    <button
                      type="button"
                      className="shop-sound-pack-preview shop-live-sound"
                      title={t("Preview sound")}
                      onMouseEnter={() => {
                        if (sound.effect_key) preloadSoundPack(sound.effect_key);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        previewSoundPack(sound.effect_key);
                      }}
                    >
                      <Volume2 size={14} />
                      <span>{sound.name}</span>
                      <span className="shop-sound-pack-play">
                        <Play size={10} fill="currentColor" />
                        {t("Preview")}
                      </span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shop-equipped-list">
        <div className="shop-profile-stage-label">
          <Sparkles size={13} />
          {t("Equipped")}
        </div>
        <ul>
          {EQUIPPED_SLOTS.map((slot) => {
            const item = slot.pick(me);
            return (
              <li key={slot.id} className={item ? "is-set" : ""}>
                <span>{t(slot.label)}</span>
                <b>{item?.name || t("None")}</b>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
