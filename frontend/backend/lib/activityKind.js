'use strict';
// Server twin of src/lib/gameActivity.js: a known non-game app (Discord,
// launchers, browsers, Descall, Spotify, OBS…) is never stored as a game.
// Applied on every activity:update, so a wrong row is corrected by the next
// presence update (no migration, nothing deleted).
const NON_GAME_RE =
  /\b(discord(\s*(ptb|canary|development))?|descall|steam(webhelper)?|epic\s*games(\s*launcher)?|battle\.?net|ea\s*app|origin|ubisoft\s*connect|uplay|gog\s*galaxy|xbox(\s*app)?|game\s*bar|overwolf|medal|nvidia(\s*(overlay|share|app))?|geforce\s*experience|radeon|spotify|obs(\s*studio)?|streamlabs|chrome|google\s*chrome|firefox|edge|msedge|opera(\s*gx)?|brave|vivaldi|safari|arc|teams|slack|zoom|skype|telegram|whatsapp|signal|teamspeak|mumble|vs\s*code|visual\s*studio(\s*code)?|code|explorer|windows\s*terminal|vlc|wallpaper\s*engine)\b/i;

function normalizeActivityType(appName, appType) {
  const type = String(appType || 'app').slice(0, 32);
  const name = String(appName || '').replace(/^(using|playing)\s+/i, '');
  if (type === 'game' && NON_GAME_RE.test(name)) return 'app';
  return type;
}

module.exports = { normalizeActivityType, NON_GAME_RE };
