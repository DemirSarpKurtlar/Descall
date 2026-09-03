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
const channelAccess = readFileSync(join(root, "../servers/ChannelPermissionsModal.jsx"), "utf8");
const rolesModal = readFileSync(join(root, "../servers/ServerRolesModal.jsx"), "utf8");
const riot = readFileSync(join(root, "../settings/RiotLinkCard.jsx"), "utf8");
const sidebar = readFileSync(join(root, "../servers/ServersSidebar.jsx"), "utf8");

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


assert(channelAccess.includes("BlockListSkeleton") && channelAccess.includes("setLoading"), "Channel access modal must skeleton while overrides load");
assert(rolesModal.includes("BlockListSkeleton") && rolesModal.includes("setLoading"), "Roles modal must skeleton while roles/members load");
assert(riot.includes("SkeletonLine"), "Riot link settings must skeleton instead of blank Loading text");
assert(sidebar.includes("channelListReady"), "channel list must wait on myPermissions before painting");
console.log("Skeleton.selftest.mjs: ok");
