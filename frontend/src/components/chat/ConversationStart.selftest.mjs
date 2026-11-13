// Empty conversation starts and header title pills (2026-11 owner report). Run:
//   node src/components/chat/ConversationStart.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../..");
const read = (p) => readFileSync(join(src, p), "utf8");
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const list = read("components/chat/MessageList.jsx");
assert.match(list, /variant="channel"/, "empty text channel uses ConversationStart");
assert.match(list, /variant="dm"/, "empty DM uses ConversationStart");
assert.match(list, /variant="group"/, "empty group uses ConversationStart");
assert.match(list, /channelTopicText\(activeChannel, t\)/, "channel start shows the localized template topic");
assert.equal(/is-channel-start/.test(list), false, "old top-left channel start is gone");

const panel = read("components/layout/ChatPanel.jsx");
assert.match(panel, /cloneElement\(children, \{ searchQuery: "", conversationStart \}\)/, "ChatPanel hands the quick actions to MessageList");
assert.match(panel, /onSendMessage\?\.\(HELLO_STICKER_TOKEN\)/, "Say hi sends the existing hello sticker");
assert.match(panel, /groupActions\.run\(cur\.activeGroup, "add"\)/, "Add people opens the existing add-member sheet");
assert.match(panel, /channelTopicText\(activeChannel, t\)/, "header subtitle shows the localized template topic");
assert.match(panel, /" has-lead"/, "identity pill marks an avatar / icon lead");

const stickers = read("lib/descallStickers.js");
assert.match(stickers, /HELLO_STICKER_TOKEN = ":ds-sticker-hello:"/);
assert.match(stickers, /hello: svg\(/, "the hello sticker exists");

const voice = read("components/servers/ServerVoicePanel.jsx");
assert.match(voice, /variant="voice"/);
assert.match(voice, /joinInEmptyRoom \? null : \(/, "empty room hides the lone dock join button");

const css = noComments(read("styles/conversation-start.css"));
assert.match(css, /\.message-list\.is-conv-start \{[^}]*justify-content:\s*safe center/, "start block centred in the list");
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.conv-start-ring \{ animation: none;/, "rings stop with reduced motion");
assert.match(css, /html\[data-theme="light"\] \.conv-start \{/, "light theme hairlines");
assert.match(read("styles.css"), /@import '\.\/styles\/conversation-start\.css';/);

// Header pills: a title-only pill has the same inset on both sides; lines end in "…".
const chat = noComments(read("styles/glass-desktop/chat.css"));
assert.match(chat, /html\.glass-desktop \.header-identity:not\(\.has-lead\) \{\s*padding: 0 22px;/);
assert.match(chat, /html\.glass-desktop \.header-identity \{[^}]*max-width: min\(440px, 100%\)/);
assert.match(chat, /html\.glass-desktop \.header-identity \.header-title-text,\s*html\.glass-desktop \.header-identity \.header-subtitle \{[^}]*text-overflow: ellipsis/);

console.log("ConversationStart.selftest ok");
