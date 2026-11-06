/** Forward arrow (curved, pointing right), stroke style of the app's line icons. */
export default function ForwardGlyph({ size = 16, strokeWidth = 2, className, title }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      <path d="M15 5l6 6-6 6" />
      <path d="M21 11H10a6 6 0 0 0-6 6v2" />
    </svg>
  );
}
