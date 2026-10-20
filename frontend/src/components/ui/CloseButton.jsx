import { X } from "./Icon.jsx";

/**
 * The one close button (approved 2026-10-19, ai-look 02-unified-icons):
 * 32 px circle, Phosphor X Bold 16, 44 px hit area, never a "×" character.
 * Press feedback is on pointer-down (styles/close-button.css).
 */
export default function CloseButton({ onClick, label = "Kapat", className = "", size = 32, ...rest }) {
  return (
    <button
      type="button"
      className={`ui-close-btn${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      style={size !== 32 ? { "--ui-close-size": `${size}px` } : undefined}
      {...rest}
    >
      <X size={16} weight="bold" />
    </button>
  );
}
