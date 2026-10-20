/**
 * Only real games may be shown as "{name} oynuyor" (2.13.6).
 *
 * The process scanner reports every known app (Discord = "communication",
 * browsers, Spotify, OBS…), and the user panel used to take any
 * activity's displayName as the game, so "Using Discord" became
 * "Using Discord oynuyor". A game label now needs appType "game" (or a
 * manual status) and a name that is not a known non-game app.
 */
const NON_GAME_RE =
  /\b(discord(\s*(ptb|canary|development))?|descall|steam(webhelper)?|epic\s*games(\s*launcher)?|battle\.?net|ea\s*app|origin|ubisoft\s*connect|uplay|gog\s*galaxy|xbox(\s*app)?|game\s*bar|overwolf|medal|nvidia(\s*(overlay|share|app))?|geforce\s*experience|radeon|spotify|obs(\s*studio)?|streamlabs|chrome|google\s*chrome|firefox|edge|msedge|opera(\s*gx)?|brave|vivaldi|safari|arc|teams|slack|zoom|skype|telegram|whatsapp|signal|teamspeak|mumble|vs\s*code|visual\s*studio(\s*code)?|code|explorer|windows\s*terminal|vlc|wallpaper\s*engine)\b/i;
const VERB_PREFIX_RE = /^(using|playing|listening to|browsing with|coding in|creating in|watching with|in|oynuyor:?)\s+/i;

export function stripActivityVerb(raw) {
  return String(raw || "").trim().replace(VERB_PREFIX_RE, "").trim();
}

export function isNonGameName(name) {
  const n = stripActivityVerb(name);
  return !n || NON_GAME_RE.test(n);
}

/** Game name to show, or "" when the activity is not a real game. */
export function gameNameFromActivity(activity) {
  if (!activity || typeof activity !== "object") return "";
  const type = String(activity.appType || activity.app_type || "").toLowerCase();
  const manual = type === "manual" || activity.is_manual === true;
  const raw = activity.gameName || activity.appName || activity.app_name || activity.name || activity.displayName || activity.display_name || "";
  const display = String(activity.displayName || activity.display_name || "");
  // Raw window-title style labels ("Using X", "Browsing with X") are never games.
  if (!manual && /^(using|listening to|browsing with|coding in|creating in|watching with|in)\s/i.test(display)) return "";
  if (!manual && type && type !== "game") return "";
  if (!manual && !type && !/^playing\s/i.test(display) && !activity.gameName && !activity.name) return "";
  const name = stripActivityVerb(manual ? display || raw : raw);
  if (!name || isNonGameName(name)) return "";
  return name.slice(0, 80);
}
