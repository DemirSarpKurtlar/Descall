/**
 * Messaging phase 5: role mentions on the client (lib/roleMentions.js) — the
 * @ suggestions after people, picked names → `<@&id>` on send and back for
 * editing, bubble tokens, plain text for quotes / copy, and the composer wiring.
 *   node src/lib/roleMentions.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  __resetRoles, canManageMentions, decodeRoleMentions, encodeRoleMentions, getRole, registerRoles, roleColorHex,
  roleSuggestions, roleToken, roleTokensToText, rolesVersion, subscribeRoles,
} from "./roleMentions.js";
import { plainText, tokenizeInline } from "./messageMarkdown.js";

const R1 = "0a1b2c3d-0000-4000-8000-000000000001";
const R2 = "0a1b2c3d-0000-4000-8000-000000000002";
const R3 = "0a1b2c3d-0000-4000-8000-000000000003";
const roles = [
  { id: "every", name: "@everyone", isEveryone: true, position: 0, mentionable: true },
  { id: R1, name: "Tasarım Ekibi", color: 0xe67e22, position: 3, mentionable: true },
  { id: R2, name: "Gizli Kurul", color: 0, position: 5, mentionable: false },
  { id: R3, name: "Tasarım", color: 0x2ecc71, position: 1, mentionable: true },
];
const member = { id: "s1", roles, myPermissions: { flags: { SEND_MESSAGES: true } } };
const manager = { id: "s1", roles, myPermissions: { flags: { MANAGE_ROLES: true } } };
const admin = { id: "s1", roles, myPermissions: { flags: { ADMINISTRATOR: true } } };
const owner = { id: "s1", roles, isOwner: true };

// Who may ping what.
assert.equal(canManageMentions(member), false);
assert.equal(canManageMentions(manager), true);
assert.equal(canManageMentions(admin), true);
assert.equal(canManageMentions(owner), true);
assert.equal(canManageMentions(null), false);

// Suggestions: a plain member sees only mentionable roles, no @everyone / @here.
const names = (items) => items.map((it) => (it.kind === "role" ? it.role.name : `@${it.mass}`));
assert.deepEqual(names(roleSuggestions(member, "")), ["Tasarım Ekibi", "Tasarım"], "mentionable only, higher role first");
assert.deepEqual(names(roleSuggestions(member, "gizli")), [], "non-mentionable role hidden from members");
// Managers / admins / owner: every role plus @everyone and @here.
assert.deepEqual(names(roleSuggestions(manager, "")), ["Gizli Kurul", "Tasarım Ekibi", "Tasarım", "@everyone", "@here"]);
assert.deepEqual(names(roleSuggestions(owner, "gizli")), ["Gizli Kurul"]);
assert.deepEqual(names(roleSuggestions(admin, "her")), ["@here"]);
assert.deepEqual(names(roleSuggestions(admin, "ev")), ["@everyone"], "prefix match for @everyone / @here");
// Turkish folding and prefix-first ordering.
assert.deepEqual(names(roleSuggestions(member, "TASARIM")), ["Tasarım Ekibi", "Tasarım"]);
assert.deepEqual(names(roleSuggestions(member, "ekib")), ["Tasarım Ekibi"]);
const it = roleSuggestions(member, "tasarım e")[0];
assert.deepEqual(it, { kind: "role", role: { id: R1, name: "Tasarım Ekibi", color: 0xe67e22, hex: "#e67e22", mentionable: true } });
assert.deepEqual(roleSuggestions(null, ""), []);
assert.deepEqual(roleSuggestions({ id: "s", roles: null }, ""), []);

// Colours.
assert.equal(roleColorHex(0x2ecc71), "#2ecc71");
assert.equal(roleColorHex(0), null);

// Picked names → tokens (longest first, word boundary), and back.
const picked = new Map([["Tasarım", R3], ["Tasarım Ekibi", R1]]);
assert.equal(
  encodeRoleMentions("@Tasarım Ekibi ve @Tasarım bakın, @Tasarımcı değil, mail@Tasarım değil", picked),
  `${roleToken(R1)} ve ${roleToken(R3)} bakın, @Tasarımcı değil, mail@Tasarım değil`
);
assert.equal(encodeRoleMentions("@Tasarım", new Map()), "@Tasarım", "nothing picked: unchanged");
assert.equal(encodeRoleMentions("(@Tasarım)", picked), `(${roleToken(R3)})`);

// Store + text for quotes / notifications.
__resetRoles();
let pings = 0;
const off = subscribeRoles(() => { pings += 1; });
const v0 = rolesVersion();
registerRoles(roles, "s1");
assert.equal(pings, 1, "listeners told once");
assert.ok(rolesVersion() > v0);
registerRoles(roles, "s1");
assert.equal(pings, 1, "same roles: no change");
off();
assert.equal(getRole(R1.toUpperCase())?.name, "Tasarım Ekibi");
assert.equal(getRole("every"), null, "@everyone is not stored");
assert.equal(roleTokensToText(`${roleToken(R1)} ve ${roleToken("0a1b2c3d-0000-4000-8000-0000000000ff")}`, "rol"), "@Tasarım Ekibi ve @rol");
const back = decodeRoleMentions(`Selam ${roleToken(R1)} ve ${roleToken(R3)}`);
assert.equal(back.text, "Selam @Tasarım Ekibi ve @Tasarım");
assert.deepEqual([...back.picked], [["Tasarım Ekibi", R1], ["Tasarım", R3]]);
assert.equal(encodeRoleMentions(back.text, back.picked), `Selam ${roleToken(R1)} ve ${roleToken(R3)}`, "round trip");

// Bubbles: the tokenizer yields a role token; plain text reads the name.
const toks = tokenizeInline(`**Not:** ${roleToken(R1)} @ayse <@&kotu>`);
const role = toks.find((t) => t.type === "role");
assert.equal(role.id, R1.toLowerCase());
assert.ok(toks.some((t) => t.type === "mention" && t.value === "@ayse"), "user mentions unchanged");
assert.ok(!toks.some((t) => t.type === "role" && t.value === "<@&kotu>"), "malformed token stays text");
assert.equal(plainText(`Bakın ${roleToken(R1)}`), "Bakın @Tasarım Ekibi");

// Composer wiring: roles after people, @ mentions only, encoded on send, pill in bubbles.
const composer = readFileSync(new URL("../components/chat/MessageComposer.jsx", import.meta.url), "utf8");
const peopleAt = composer.indexOf('out.push({ id: "all"');
const rolesAt = composer.indexOf('out.push({ id: "roles"');
assert.ok(peopleAt > 0 && rolesAt > peopleAt, "role section comes after the people");
assert.ok(/if \(mentionState && serverIdForPicker\)/.test(composer), "roles only for @ in a server channel");
assert.ok(composer.includes("encodeMentions(text)") && composer.includes("encodeMentions(message.trim())"), "text and captions are encoded");
assert.ok(composer.includes("decodeRoleMentions(editingMessage.text"), "editing shows names");
const picker = readFileSync(new URL("../components/chat/SlashCommandMenu.jsx", import.meta.url), "utf8");
assert.ok(picker.includes("function MentionTargetRow") && picker.includes('data-testid={isRole ? "mention-role"'), "picker draws role rows");
const content = readFileSync(new URL("../components/chat/MessageContent.jsx", import.meta.url), "utf8");
assert.ok(content.includes('token.type === "role"') && content.includes("msg-role-mention"), "bubbles draw the pill");

console.log("roleMentions selftest OK");
