/**
 * Apple-style checkbox. The native input stays for the label, keyboard,
 * and form state; the box beside it is the glass face and the drawn check.
 */
export default function GlassCheckbox({ className = "", ...props }) {
  return (
    <span className="dc-check">
      <input
        {...props}
        type="checkbox"
        className={className ? `dc-check-input ${className}` : "dc-check-input"}
      />
      <span className="dc-check-box" aria-hidden="true">
        <svg className="dc-check-svg" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path className="dc-check-mark" pathLength="1" d="M6 11.2 9.2 14.5 16.2 7.4" />
        </svg>
      </span>
    </span>
  );
}
