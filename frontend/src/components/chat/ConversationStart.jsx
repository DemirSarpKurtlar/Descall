/**
 * The start of an empty conversation (2026-11 owner request): a DM or group with
 * no messages, an empty text channel and an empty voice channel open on one
 * composed block instead of a blank glass pane.
 *
 *   media    the person's avatar, the group icon, a channel tile or the voice seats
 *   title    name (ellipsised on one line), `handle` a quiet second line
 *   body     one friendly sentence
 *   actions  [{ id, label, icon, onClick, primary, disabled }] quick actions that
 *            already exist elsewhere (say hi, call, profile, add people)
 *   children extra content under the actions (the voice channel's join button)
 *
 * Styles: styles/conversation-start.css (base, glass-desktop, phone glass, light,
 * reduced motion). Centred in the free space of the list by its parent.
 */
import { Hash, User, Volume2 } from "../ui/Icon.jsx";

export function ChannelTile({ icon: Icon = Hash }) {
  return (
    <span className="conv-start-tile">
      <Icon size={34} strokeWidth={1.75} />
    </span>
  );
}

/**
 * Empty voice channel: the channel's speaker in a softly glowing ring, with the
 * empty seats where people appear once they join.
 */
export function VoiceSeats({ icon: Icon = Volume2 }) {
  return (
    <span className="conv-start-seats">
      <span className="conv-start-seat is-far"><User size={16} /></span>
      <span className="conv-start-seat is-near"><User size={20} /></span>
      <span className="conv-start-seat is-main">
        <span className="conv-start-ring" />
        <span className="conv-start-ring is-late" />
        <Icon size={36} strokeWidth={1.75} />
      </span>
      <span className="conv-start-seat is-near"><User size={20} /></span>
      <span className="conv-start-seat is-far"><User size={16} /></span>
    </span>
  );
}

export default function ConversationStart({
  variant = "dm",
  media = null,
  title,
  handle,
  body,
  actions = [],
  children = null,
  className = "",
}) {
  const shown = actions.filter(Boolean);
  return (
    <section className={`conv-start is-${variant}${className ? ` ${className}` : ""}`} aria-label={typeof title === "string" ? title : undefined}>
      {media ? (
        <div className="conv-start-media" aria-hidden="true">
          <span className="conv-start-halo" />
          {media}
        </div>
      ) : null}
      <div className="conv-start-text">
        {title ? <h2 className="conv-start-title" title={typeof title === "string" ? title : undefined}>{title}</h2> : null}
        {handle ? <p className="conv-start-handle">{handle}</p> : null}
        {body ? <p className="conv-start-body">{body}</p> : null}
      </div>
      {shown.length ? (
        <div className="conv-start-actions">
          {shown.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                className={`empty-cta conv-start-action${a.primary ? " primary" : ""}`}
                onClick={a.onClick}
                disabled={a.disabled}
                data-action={a.id}
              >
                {Icon ? <Icon size={16} aria-hidden="true" /> : null}
                <span>{a.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {children}
    </section>
  );
}
