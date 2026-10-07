/** Client mirror of backend/lib/ageGate.js (server is the source of truth). */
export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export function parseBirthDate(raw) {
  const m = String(raw || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d };
}

export function ageFromBirthDate(raw, now = new Date()) {
  const p = parseBirthDate(raw);
  if (!p) return null;
  let age = now.getFullYear() - p.y;
  if (now.getMonth() + 1 < p.mo || (now.getMonth() + 1 === p.mo && now.getDate() < p.d)) age -= 1;
  return age;
}

/** "unknown" | "child" | "teen" | "adult" */
export function ageGroupOf(raw) {
  const age = ageFromBirthDate(raw);
  if (age == null) return "unknown";
  if (age < MIN_AGE) return "child";
  if (age < ADULT_AGE) return "teen";
  return "adult";
}

export function isEligibleBirthDate(raw) {
  const age = ageFromBirthDate(raw);
  return age != null && age >= MIN_AGE && age <= 120;
}
