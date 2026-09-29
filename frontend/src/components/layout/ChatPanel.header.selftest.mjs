/**
 * Run: node frontend/src/components/layout/ChatPanel.header.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const stylesRoot = join(root, "../../styles");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const chatPanel = readFileSync(join(root, "ChatPanel.jsx"), "utf8");
const appLayout = readFileSync(join(root, "AppLayout.jsx"), "utf8");
const css = readFileSync(join(stylesRoot, "app-layout.css"), "utf8");

const headerRight = chatPanel.split('className="header-right"')[1]?.split("</header>")[0] || "";

assert(headerRight.length > 0, "ChatPanel must have a header-right actions row");
assert(!/title=\{t\("Settings"\)\}/.test(headerRight), "chat header must not include a Settings gear");
assert(!/<Settings\b/.test(headerRight), "chat header must not render a Settings icon");
assert(!/\bonSettings\b/.test(chatPanel), "ChatPanel must not take an onSettings prop");
assert(!/onSettings=\{openUserPanel\}/.test(appLayout), "AppLayout must not pass settings into ChatPanel");
assert(/<Search\b/.test(headerRight), "chat header must keep Search");
assert(/<Users\b/.test(headerRight), "chat header must keep Members for groups/servers");
assert(
  /\{!headerDm && \(\s*<button[\s\S]{0,200}title=\{t\("Members"\)\}/.test(headerRight),
  "DM header must not show the Members (user list) button",
);
assert(/showMembers && !headerDm && \(/.test(chatPanel), "members panel must never open in a DM");
assert(/<Pin\b/.test(headerRight), "chat header must keep Pinned messages");
assert(/<Phone\b/.test(headerRight), "chat header must keep Voice Call");
assert(/aria-label=\{t\("Search"\)\}/.test(headerRight), "Search needs an accessible name");
assert(/aria-label=\{t\("Members"\)\}/.test(headerRight), "Members needs an accessible name");
assert(/aria-label=\{t\("Voice Call"\)\}/.test(headerRight), "Voice Call needs an accessible name");
assert(/aria-label=\{t\("Video Call"\)\}/.test(headerRight), "Video Call needs an accessible name");
assert(
  /\.header-right \{[\s\S]{0,120}margin-left:\s*auto/.test(css),
  "header actions must sit on the right via margin-left: auto",
);
assert(
  /\.header-title-text \{[\s\S]{0,120}text-overflow:\s*ellipsis/.test(css),
  "chat title must ellipsize instead of overlapping icons",
);
assert(
  /\.header-title-block\.is-dm \.header-title-text \{[\s\S]{0,120}white-space:\s*normal/.test(css),
  "DM names must wrap instead of ending in an ellipsis",
);
assert(
  /\.header-avatar\.has-cosmetics \.ui-avatar \{[\s\S]{0,80}width:\s*28px/.test(css) &&
    /headerDmHasCosmetics \? 28 : 40/.test(chatPanel),
  "framed DM header avatar must shrink so the shop frame fits the 40px slot",
);


assert(
  /const headerGroup = activeGroup/.test(chatPanel) && /const headerDm = headerGroup \? null/.test(chatPanel),
  "header must use exclusive headerGroup / headerDm (no stacked DM+group chrome)",
);
assert(
  /className="chat-top-chrome"/.test(chatPanel) && /key=\{headerConversationKey\}/.test(chatPanel),
  "header + Ses Odası must remount under one keyed chat-top-chrome",
);
assert(
  /className="header-identity"/.test(chatPanel),
  "header identity block must remain a single exclusive avatar/icon host",
);
assert(
  !/<VoiceRoomBar\b/.test(chatPanel),
  "Group chat must not render a persistent voice room bar",
);
assert(
  !/from \"..\/voice\/VoiceRoomBar\"/.test(chatPanel),
  "ChatPanel must not import the voice room bar",
);
assert(
  /header-identity/.test(css),
  "header-identity containment styles must exist",
);
assert(
  /\.header-identity > \.header-avatar ~ \.header-icon/.test(css),
  "CSS must hide stacked DM avatar + group icon",
);
assert(
  /\.chat-top-chrome\s*~\s*\.chat-top-chrome/.test(css) &&
    /\.voice-room-bar\s*~\s*\.voice-room-bar/.test(css),
  "CSS must hide stacked Ses Odası / chat-top-chrome leftovers after DM→group",
);

const avatar = readFileSync(join(root, "../ui/Avatar.jsx"), "utf8");
assert(
  /const Root = isSpeaking \? motion\.div : "div"/.test(avatar),
  "idle Avatar must be a plain div (no Framer transform bleed on Electron)",
);

const serversCss = readFileSync(join(stylesRoot, "servers.css"), "utf8");
assert(
  /\.server-type-toggle \{[\s\S]{0,160}flex-wrap:\s*wrap/.test(serversCss),
  "create-channel type chips must wrap inside the modal",
);
assert(
  /\.server-roles-tabs \{[\s\S]{0,120}flex-wrap:\s*wrap/.test(serversCss),
  "roles modal tabs must wrap",
);
assert(
  /\.server-modal \{[\s\S]{0,400}overflow-x:\s*hidden/.test(serversCss),
  "server modal must clip horizontal overflow",
);

console.log("ChatPanel.header.selftest.mjs: ok");
