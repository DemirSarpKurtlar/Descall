/**
 * Back-compat entry. New call sites use lib/fluid/haptics.js.
 * Web and desktop stay a no-op; only the native iOS shell ticks.
 */
export {
  primeHaptics,
  hapticLight,
  hapticSelection,
  hapticImpactLight,
  hapticImpactMedium,
  hapticImpactRigid,
  hapticSuccess,
  hapticWarning,
  hapticError,
  hapticCallConnected,
  resetCallHaptic,
  installIosHapticHints,
} from "./fluid/haptics";
