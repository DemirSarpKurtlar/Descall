/**
 * Run: node frontend/src/components/ui/Skeleton.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const skeleton = readFileSync(join(root, "Skeleton.jsx"), "utf8");
const avatar = readFileSync(join(root, "Avatar.jsx"), "utf8");
const css = readFileSync(join(root, "../../styles/base.css"), "utf8");
const dima = readFileSync(join(root, "../dimaai/DimaAiWorkspace.jsx"), "utf8");
const servers = readFileSync(join(root, "../servers/ServersSidebar.jsx"), "utf8");
const serverIcon = readFileSync(join(root, "../servers/ServerIcon.jsx"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(skeleton.includes("export function SkeletonImage"), "shared image wrapper must shimmer until decode");
assert(skeleton.includes("export function DimaHistorySkeleton"), "Dima history rows need a dedicated skeleton");
assert(skeleton.includes("export function DimaThreadSkeleton"), "Dima bubbles need a dedicated skeleton");
assert(skeleton.includes("export function ChannelListSkeleton"), "server channels need a dedicated skeleton");
assert(skeleton.includes("img.complete"), "cached images must not wait on a skipped onLoad");
assert(css.includes(".skeleton-media"), "decoded photos need a reserved media frame");
assert(css.includes(".skeleton-dima-thread"), "Dima thread skeleton must match bubble layout");
assert(css.includes("prefers-reduced-motion"), "shimmer must respect reduced motion");
assert(avatar.includes("ui-avatar-skeleton"), "avatars must shimmer instead of a faded letter");
assert(servers.includes("<ServerIcon"), "server list custom photos must go through ServerIcon");
assert(serverIcon.includes("SkeletonImage"), "ServerIcon must hold a skeleton until the icon bitmap is ready");
assert(dima.includes("threadLoading"), "switching Dima chats must track a loading state");
assert(dima.includes("<DimaThreadSkeleton"), "Dima must not keep the previous thread visible while the next one loads");
assert(dima.includes("<DimaHistorySkeleton"), "Dima history must skeleton before the empty state");
assert(dima.includes("readThreadCache"), "Dima must reuse a cached thread instead of waiting on the network");
assert(
  /else if \(openingFresh\) \{[\s\S]{0,180}setMessages\(\[\]\)/.test(dima),
  "Dima chat switch must clear the previous bubbles only when there is no cache",
);
assert(
  /\}, \[beginAccountFetch\]\);/.test(dima),
  "conversation reload must not retrigger when i18n t() identity changes",
);

const app = readFileSync(join(root, "../../App.jsx"), "utf8");
const messageList = readFileSync(join(root, "../chat/MessageList.jsx"), "utf8");
assert(messageList.includes("<MessageSkeleton"), "channel/DM message pane must render MessageSkeleton while loading");
assert(
  /channelMessagesById\[activeChannel\.id\] === undefined/.test(app),
  "server channel switch must skeleton from cache-undefined, not messagesLoading race",
);
assert(
  /dmByUserId\[activeDmUser\.id\] === undefined/.test(app) &&
    /groupMessagesById\[activeGroup\.id\] === undefined/.test(app),
  "DM and group open must skeleton when their message caches are empty",
);
console.log("Skeleton.selftest.mjs: ok");
