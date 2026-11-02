import { useSyncExternalStore } from "react";
import { useT } from "../context/LocaleContext";
import { getUser } from "../lib/storage";
import { normalizePlan } from "./features.js";
import { getPremiumState, subscribePremium } from "./premiumStore.js";
import "./premium.css";

/**
 * Descall+ / Ultra badge next to a name. Same two sizes as the staff badge
 * (AdminBadge): "inline" (18 px square, list rows) and "chip" (square + label, profile
 * card / user panel). Glass tint, no glow, no motion.
 *
 * The plan comes from the user object (premium_plan / premiumPlan / premium.plan,
 * as the server adds it to public user payloads), or for yourself from usePremium's store.
 */
export function premiumPlanOf(user) {
  if (!user || typeof user !== "object") return null;
  const raw = user.premium_plan ?? user.premiumPlan ?? user.premium?.plan ?? null;
  if (user.premium && typeof user.premium === "object" && user.premium.status && user.premium.status !== "active") return null;
  return normalizePlan(raw);
}

function isSelf(user) {
  try {
    const me = getUser();
    return Boolean(me?.id && user?.id && String(me.id) === String(user.id));
  } catch {
    return false;
  }
}

export function PremiumGlyph({ plan, size = 11 }) {
  if (plan === "ultra") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2.5 14.6 9l6.9.5-5.3 4.4 1.7 6.7L12 16.9l-5.9 3.7 1.7-6.7L2.5 9.5 9.4 9z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export default function PremiumBadge({ user, plan: planProp, variant = "inline", className = "" }) {
  const t = useT();
  const store = useSyncExternalStore(subscribePremium, getPremiumState, getPremiumState);
  const plan = normalizePlan(planProp) || premiumPlanOf(user) || (isSelf(user) ? store.plan : null);
  if (!plan) return null;
  const tip = plan === "ultra" ? t("premium.badge.ultraTip") : t("premium.badge.plusTip");
  const label = plan === "ultra" ? t("premium.name.ultraShort") : t("premium.name.plus");
  const classes = ["dsc-premium-badge", `is-${plan}`, `dsc-premium-badge--${variant}`, className].filter(Boolean).join(" ");
  return (
    <span className={classes} title={tip} aria-label={tip} role="img" data-plan={plan}>
      <span className="dsc-premium-badge-mark">
        <PremiumGlyph plan={plan} size={variant === "chip" ? 12 : 10} />
      </span>
      {variant === "chip" ? <span className="dsc-premium-badge-label">{label}</span> : null}
    </span>
  );
}
