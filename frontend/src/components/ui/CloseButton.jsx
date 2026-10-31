import { X } from "./Icon.jsx";
import { t } from "../../i18n/runtime.js";

/**
 * The one close button (approved 2026-10-19, ai-look 02-unified-icons):
 * 32 px circle, Phosphor X Bold 16, 44 px hit area, never a "×" character.
 * Press feedback is on pointer-down (styles/close-button.css).
 */
export default function CloseButton({ onClick, label, className = "", size = 32, ...rest }) {
  const text = label || t("Close");
  return (
    <button
      type="button"
      className={`ui-close-btn${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={text}
      title={text}
      style={size !== 32 ? { "--ui-close-size": `${size}px` } : undefined}
      {...rest}
    >
      <X size={16} weight="bold" />
    </button>
  );
}
