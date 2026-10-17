import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateAvatarFile, needsCrop, groupAvatarUrl, applyGroupAvatar, AVATAR_MAX_BYTES, AVATAR_ACCEPT } from "./avatarFile.js";

const f = (type, size = 1000) => ({ type, size });
assert.equal(validateAvatarFile(f("image/png")), null);
assert.equal(validateAvatarFile(f("image/gif")), null);
assert.equal(validateAvatarFile(f("image/svg+xml")), "type");
assert.equal(validateAvatarFile(f("image/jpeg", AVATAR_MAX_BYTES + 1)), "size");
assert.equal(validateAvatarFile(f("image/jpeg", AVATAR_MAX_BYTES)), null);
assert.equal(validateAvatarFile(null), "missing");
assert.equal(AVATAR_MAX_BYTES, 8 * 1024 * 1024); // same as /api/media/avatar
assert.match(AVATAR_ACCEPT, /image\/gif/);
// GIFs keep animation (no canvas crop), stills go through the crop editor.
assert.equal(needsCrop(f("image/gif")), false);
assert.equal(needsCrop(f("image/jpeg")), true);

assert.equal(groupAvatarUrl({ avatar_url: "a" }), "a");
assert.equal(groupAvatarUrl({ avatarUrl: "b", avatar_url: "a" }), "b");
assert.equal(groupAvatarUrl({ icon: "c" }), "c");
assert.equal(groupAvatarUrl({}), null);
assert.equal(groupAvatarUrl(null), null);

const gs = [{ id: 1, name: "x" }, { id: 2, name: "y", avatarUrl: "old" }];
const set = applyGroupAvatar(gs, 1, "new.gif");
assert.equal(groupAvatarUrl(set[0]), "new.gif");
assert.equal(set[1], gs[1]);
const cleared = applyGroupAvatar(gs, 2, null);
assert.equal(groupAvatarUrl(cleared[1]), null);
assert.notEqual(cleared, gs);

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const sidebar = read("../components/layout/ServerSidebar.jsx");
assert.match(sidebar, /t\("Change Group Photo"\)/);
assert.match(sidebar, /t\("Remove Group Photo"\)/);
assert.match(sidebar, /<GroupIcon/);
const chat = read("../components/layout/ChatPanel.jsx");
assert.match(chat, /<GroupIcon/);
assert.match(chat, /groupPhoto\.pick\(/);
const app = read("../App.jsx");
assert.match(app, /socket\.on\("group:avatar:updated"/);
const changer = read("../components/groups/useGroupPhotoChanger.jsx");
assert.match(changer, /ImageCropModal/);
assert.match(changer, /needsCrop\(file\)/);
const icon = read("../components/groups/GroupIcon.jsx");
assert.match(icon, /useHoverGif/);
const serverIcon = read("../components/servers/ServerIcon.jsx");
assert.match(serverIcon, /useHoverGif/);
const serversSidebar = read("../components/servers/ServersSidebar.jsx");
assert.doesNotMatch(serversSidebar, /Still crop GIFs/);
const tr = read("../i18n/locales/tr.js");
assert.match(tr, /"Change Group Photo": "Grup Fotoğrafını Değiştir"/);
assert.match(tr, /"Remove Group Photo": "Grup Fotoğrafını Kaldır"/);

console.log("groupPhoto.selftest ok");
