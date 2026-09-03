import { motion } from "framer-motion";

export default function RippleButton({ children, className = "", onClick, type = "button", disabled, ...rest }) {
  return (
    <motion.button
      type={type}
      className={`ripple-btn ${className}`}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      {...rest}
    >
      <span className="ripple-inner">{children}</span>
    </motion.button>
  );
}
