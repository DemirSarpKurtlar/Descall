/**
 * The one empty state (UI audit #19): a 48 px glass tile with a line icon,
 * a 17/600 title, a 14/400 secondary line, and at most one primary plus one
 * secondary button. No blobs, no dashed boxes.
 *
 * `illustration` is accepted for older call sites and ignored.
 * `compact` is the sidebar size (smaller padding, no flex fill).
 * `role="alert"` style error states pass `tone="error"`.
 */
export default function EmptyState({
  icon: Icon,
  title,
  body,
  primary,
  secondary,
  compact = false,
  tone,
  className = "",
  // eslint-disable-next-line no-unused-vars
  illustration,
}) {
  const PrimaryIcon = primary?.icon;
  const SecondaryIcon = secondary?.icon;
  const cls = ["empty-state", compact ? "compact" : "", tone ? `tone-${tone}` : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls} role={tone === "error" ? "alert" : undefined}>
      {Icon ? (
        <div className="empty-tile" aria-hidden="true">
          <Icon size={compact ? 20 : 24} strokeWidth={1.75} />
        </div>
      ) : null}
      {title ? <h2 className="empty-title">{title}</h2> : null}
      {body ? <p className="empty-body">{body}</p> : null}
      {(primary || secondary) && (
        <div className="empty-cta-row">
          {primary && (
            <button type="button" className="empty-cta primary" onClick={primary.action} disabled={primary.disabled}>
              {PrimaryIcon ? <PrimaryIcon size={15} /> : null}
              {primary.label}
            </button>
          )}
          {secondary && (
            <button type="button" className="empty-cta" onClick={secondary.action}>
              {SecondaryIcon ? <SecondaryIcon size={15} /> : null}
              {secondary.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
