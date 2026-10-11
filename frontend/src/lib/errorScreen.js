import { isUserAdmin } from "./userProfile.js";

/** Short support id shown on the crash screen and prefixed onto the log. */
export function makeSupportCode(random = Math.random) {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += Math.floor(random() * 16).toString(16);
  }
  return out.toUpperCase();
}

/**
 * Logged-in accounts do not store a `role` field. Admin is `is_admin` /
 * `isAdmin`, or the legacy username "admin". Missing `role` is not "guest".
 */
export function boundaryAccount(user) {
  if (!user || typeof user !== "object") {
    return {
      id: "anonymous",
      username: "Anonymous User",
      email: null,
      role: "guest",
      isAdmin: false,
      sessionId: null,
    };
  }
  const admin = isUserAdmin(user);
  const explicit = typeof user.role === "string" ? user.role.trim() : "";
  return {
    id: user.id || "anonymous",
    username: user.username || "Anonymous User",
    email: user.email || null,
    role: admin ? "admin" : explicit || "user",
    isAdmin: admin,
    sessionId: user.sessionId || null,
  };
}

/** Stack and diagnostics stay off the public screen. */
export function canSeeErrorDetails({ dev = false, admin = false } = {}) {
  return Boolean(dev || admin);
}
