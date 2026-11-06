import { useId, useSyncExternalStore } from "react";
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
 * Other people: the server puts `premium_plan` ("plus" | "ultra" | null) on the public
 * user payloads (/auth/users/:id, friends, server and group members, presence rows),
 * from one batched premium_active_for lookup. A payload without the key (an older or
 * merged copy of the same person) falls back to the last value seen for that id.
 * Yourself: usePremium's store (/api/premium/me), which premium:updated keeps live.
 */
export function premiumPlanOf(user) {
  if (!user || typeof user !== "object") return null;
  const raw = user.premium_plan ?? user.premiumPlan ?? user.premium?.plan ?? null;
  if (user.premium && typeof user.premium === "object" && user.premium.status && user.premium.status !== "active") return null;
  return normalizePlan(raw);
}

const lastSeen = new Map(); // user id -> plan from the latest payload that carried it
const LAST_SEEN_MAX = 2000;

function carriesPlan(user) {
  return Boolean(user) && typeof user === "object"
    && (user.premium_plan !== undefined || user.premiumPlan !== undefined || (user.premium !== undefined && user.premium !== null));
}

/** The plan another person's payload says, remembering it per id for copies without the key. */
export function otherPlan(user) {
  const id = user?.id ?? user?.userId ?? user?.user_id;
  const key = id == null ? null : String(id);
  if (carriesPlan(user)) {
    const plan = premiumPlanOf(user);
    if (key) {
      lastSeen.delete(key);
      lastSeen.set(key, plan);
      if (lastSeen.size > LAST_SEEN_MAX) lastSeen.delete(lastSeen.keys().next().value);
    }
    return plan;
  }
  return key ? lastSeen.get(key) ?? null : null;
}

function isSelf(user) {
  try {
    const me = getUser();
    const id = user?.id ?? user?.userId;
    return Boolean(me?.id && id && String(me.id) === String(id));
  } catch {
    return false;
  }
}

/*
 * The Descall+ / Ultra marks (approved concept A "Halka", docs/design/premium-logo):
 * Descall+ is one brand ring with a plus at its open end (violet); Ultra is the full linked
 * double ring with the centre dot (gold). Small sizes (<= 20 px) use the heavier
 * "-small" drawings so the plus and the rings stay readable at 14-16 px.
 */
const MARKS = {
  plus: {
    big: ["11.412 23.662 64.926 64.926", "M67.585 62.49A27.25 27.25 0 1 1 37.51 32.415A5.75 5.75 0 0 1 38.772 43.845A15.75 15.75 0 1 0 56.155 61.228A5.75 5.75 0 0 1 67.585 62.49ZM56.75 30.75A5.25 5.25 0 0 1 67.25 30.75L67.25 32.75L69.25 32.75A5.25 5.25 0 0 1 69.25 43.25L67.25 43.25L67.25 45.25A5.25 5.25 0 0 1 56.75 45.25L56.75 43.25L54.75 43.25A5.25 5.25 0 0 1 54.75 32.75L56.75 32.75Z"],
    small: ["10.112 14.362 75.525 75.525", "M68.579 62.6A28.25 28.25 0 1 1 37.4 31.421A6.75 6.75 0 0 1 38.881 44.839A14.75 14.75 0 1 0 55.161 61.119A6.75 6.75 0 0 1 68.579 62.6ZM61.25 21.75A5.25 5.25 0 0 1 71.75 21.75L71.75 28.25L78.25 28.25A5.25 5.25 0 0 1 78.25 38.75L71.75 38.75L71.75 45.25A5.25 5.25 0 0 1 61.25 45.25L61.25 38.75L54.75 38.75A5.25 5.25 0 0 1 54.75 28.25L61.25 28.25Z"],
    stops: ["#A99BFF", "#6A60EF"],
    rule: "evenodd",
  },
  ultra: {
    big: ["11.044 11.044 77.911 77.911", "M67.585 62.49A27.25 27.25 0 1 1 37.51 32.415A5.75 5.75 0 0 1 38.772 43.845A15.75 15.75 0 1 0 56.155 61.228A5.75 5.75 0 0 1 67.585 62.49ZM32.415 37.51A27.25 27.25 0 1 1 62.49 67.585A5.75 5.75 0 0 1 61.228 56.155A15.75 15.75 0 1 0 43.845 38.772A5.75 5.75 0 0 1 32.415 37.51ZM44.25 50a5.75 5.75 0 1 0 11.5 0a5.75 5.75 0 1 0 -11.5 0Z"],
    small: ["9.985 9.985 80.031 80.031", "M68.579 62.6A28.25 28.25 0 1 1 37.4 31.421A6.75 6.75 0 0 1 38.881 44.839A14.75 14.75 0 1 0 55.161 61.119A6.75 6.75 0 0 1 68.579 62.6ZM31.421 37.4A28.25 28.25 0 1 1 62.6 68.579A6.75 6.75 0 0 1 61.119 55.161A14.75 14.75 0 1 0 44.839 38.881A6.75 6.75 0 0 1 31.421 37.4ZM43.25 50a6.75 6.75 0 1 0 13.5 0a6.75 6.75 0 1 0 -13.5 0Z"],
    stops: ["#FFCB5C", "#E97A2C"],
    rule: "nonzero",
  },
};

/** The tier mark. `mono`: one colour (currentColor), for coloured tiles; otherwise its gradient. */
export function PremiumGlyph({ plan, size = 16, mono = false, className }) {
  const gid = useId().replace(/:/g, "");
  const m = MARKS[plan === "ultra" ? "ultra" : "plus"];
  const [viewBox, d] = size <= 20 ? m.small : m.big;
  const id = `pg${gid}`;
  return (
    <svg width={size} height={size} viewBox={viewBox} aria-hidden="true" focusable="false" className={className}>
      {mono ? null : (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={m.stops[0]} />
            <stop offset="1" stopColor={m.stops[1]} />
          </linearGradient>
        </defs>
      )}
      <path d={d} fill={mono ? "currentColor" : `url(#${id})`} fillRule={m.rule} />
    </svg>
  );
}

export default function PremiumBadge({ user, plan: planProp, variant = "inline", className = "" }) {
  const t = useT();
  const store = useSyncExternalStore(subscribePremium, getPremiumState, getPremiumState);
  const self = isSelf(user);
  // Yourself: the live store once loaded (it follows premium:updated); others: their payload.
  const plan = normalizePlan(planProp) || (self && store.loaded ? store.plan : otherPlan(user) || (self ? store.plan : null));
  if (!plan) return null;
  const tip = plan === "ultra" ? t("premium.badge.ultraTip") : t("premium.badge.plusTip");
  const label = plan === "ultra" ? t("premium.name.ultraShort") : t("premium.name.plus");
  const classes = ["dsc-premium-badge", `is-${plan}`, `dsc-premium-badge--${variant}`, className].filter(Boolean).join(" ");
  return (
    <span className={classes} title={tip} aria-label={tip} role="img" data-plan={plan}>
      <span className="dsc-premium-badge-mark">
        <PremiumGlyph plan={plan} size={variant === "chip" ? 16 : 15} />
      </span>
      {variant === "chip" ? <span className="dsc-premium-badge-label">{label}</span> : null}
    </span>
  );
}
