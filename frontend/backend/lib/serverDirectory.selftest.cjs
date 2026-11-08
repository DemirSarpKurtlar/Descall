"use strict";
// node frontend/backend/lib/serverDirectory.selftest.cjs
// Pure rules of the public server directory (item 8) and parity with the frontend copy
// of the categories / languages / limits (frontend/src/lib/serverDirectory.js).
const assert = require("node:assert/strict");
const path = require("path");
const { pathToFileURL } = require("url");
const dir = require("./serverDirectory");

async function main() {
  const front = await import(pathToFileURL(path.join(__dirname, "../../src/lib/serverDirectory.js")).href);
  assert.deepEqual(dir.CATEGORIES, front.DIRECTORY_CATEGORIES, "categories match the frontend");
  assert.deepEqual(dir.LANGUAGES, front.DIRECTORY_LANGUAGES, "languages match the frontend");
  assert.deepEqual(dir.SORTS, front.DIRECTORY_SORTS);
  assert.equal(dir.MIN_PUBLIC_MEMBERS, front.DIRECTORY_MIN_MEMBERS);
  assert.equal(dir.DESCRIPTION_MAX, front.DIRECTORY_DESCRIPTION_MAX);
  assert.equal(dir.TAGS_MAX, front.DIRECTORY_TAGS_MAX);
  assert.equal(dir.TAG_LEN_MAX, front.DIRECTORY_TAG_LEN_MAX);
  for (const raw of ["#Survival Games ", "PvP_Arena", "İstanbul", "a--b", "  ", "Türkçe!"]) {
    assert.equal(dir.normalizeTag(raw), front.normalizeDirectoryTag(raw), `same tag rule for ${JSON.stringify(raw)}`);
  }

  // The migration constrains the same lists.
  const sql = require("fs").readFileSync(path.join(__dirname, "../../../supabase/migrations/20261111_server_directory.sql"), "utf8");
  for (const id of dir.CATEGORIES) assert.ok(sql.includes(`'${id}'`), `migration allows category ${id}`);
  for (const id of dir.LANGUAGES) assert.ok(sql.includes(`'${id}'`), `migration allows language ${id}`);
  assert.ok(!/\bdrop\s+(table|column)\b(?![^\n]*--)/i.test(sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")), "migration is additive");

  // Tags
  assert.equal(dir.normalizeTag("#Survival Games "), "survival-games");
  assert.equal(dir.normalizeTag("İstanbul"), "istanbul");
  assert.equal(dir.normalizeTag("!!!"), null);
  assert.deepEqual(dir.parseTags("pvp, PvP, smp").tags, ["pvp", "smp"]);
  assert.equal(dir.parseTags(["a", "b", "c", "d", "e", "f"]).tooMany, true);
  assert.equal(dir.parseTags(["x".repeat(25)]).tooLong, true);

  // Listing input
  let r = dir.normalizeListingInput({ listed: true }, {});
  assert.equal(r.error.code, "DIRECTORY_CATEGORY", "a category is required to list");
  r = dir.normalizeListingInput({ listed: true, category: "study" }, {});
  assert.equal(r.error.code, "DIRECTORY_LANGUAGE", "a language is required to list");
  r = dir.normalizeListingInput({ listed: true, category: "nope", language: "tr" }, {});
  assert.equal(r.error.code, "DIRECTORY_CATEGORY");
  r = dir.normalizeListingInput({ listed: true, category: "study", language: "xx" }, {});
  assert.equal(r.error.code, "DIRECTORY_LANGUAGE");
  r = dir.normalizeListingInput({ listed: true, category: "study", language: "tr", description: "x".repeat(301) }, {});
  assert.equal(r.error.code, "DIRECTORY_DESCRIPTION");
  assert.deepEqual(r.error.vars, { max: 300 });
  r = dir.normalizeListingInput({ listed: true, category: "study", language: "tr", tags: "a,b,c,d,e,f" }, {});
  assert.equal(r.error.code, "DIRECTORY_TAGS");
  const now = new Date("2026-11-08T10:00:00Z");
  r = dir.normalizeListingInput({ listed: true, category: "music", language: "tr", description: "  Gece  \u0007 ", tags: "#Lo-Fi, rap" }, {}, now);
  assert.deepEqual(r.patch, {
    listed_in_directory: true,
    directory_category: "music",
    directory_language: "tr",
    directory_description: "Gece",
    directory_tags: ["lo-fi", "rap"],
    directory_listed_at: now.toISOString(),
  });
  // Already listed: listed_at is kept; unlisting clears it, category may stay.
  r = dir.normalizeListingInput({ listed: true }, { listed_in_directory: true, directory_category: "music", directory_language: "tr" }, now);
  assert.equal(r.patch.directory_listed_at, undefined);
  r = dir.normalizeListingInput({ listed: false }, { listed_in_directory: true, directory_category: "music", directory_language: "tr" }, now);
  assert.equal(r.patch.listed_in_directory, false);
  assert.equal(r.patch.directory_listed_at, null);
  assert.equal(r.patch.directory_category, "music");

  // Visibility rules
  const row = { id: "s", listed_in_directory: true, directory_category: "study" };
  const owner = { is_banned: false, deleted_at: null };
  assert.equal(dir.hiddenReason(row, { memberCount: 3, owner }), null);
  assert.equal(dir.hiddenReason(row, { memberCount: 2, owner }), "too_few_members");
  assert.equal(dir.hiddenReason({ ...row, listed_in_directory: false }, { memberCount: 9, owner }), "not_listed");
  assert.equal(dir.hiddenReason({ ...row, directory_hidden_at: "2026-11-08" }, { memberCount: 9, owner }), "moderation");
  assert.equal(dir.hiddenReason({ ...row, directory_category: null }, { memberCount: 9, owner }), "no_category");
  assert.equal(dir.hiddenReason(row, { memberCount: 9, owner: { is_banned: true } }), "owner_unavailable");
  assert.equal(dir.hiddenReason(row, { memberCount: 9, owner: { deleted_at: "2026-01-01" } }), "owner_unavailable");
  assert.equal(dir.hiddenReason(row, { memberCount: 9, owner: null }), "owner_unavailable");

  // Public card: allow-list only
  const card = dir.publicCard(
    {
      id: "s1",
      name: "Gece",
      icon_url: "https://x.supabase.co/storage/v1/object/public/a.png",
      description: "server description",
      directory_description: null,
      owner_id: "secret-owner",
      rules_text: "secret rules",
      vanity_slug: "gece",
      directory_invite_code: "SECRET01",
      directory_hidden_reason: "staff note",
      directory_category: "music",
      directory_language: "xx",
      directory_tags: ["a", "b", "c", "d", "e", "f"],
      directory_listed_at: "2026-11-01T00:00:00Z",
    },
    { memberCount: 4, onlineCount: 1 }
  );
  assert.deepEqual(Object.keys(card).sort(), ["category", "description", "iconUrl", "id", "language", "listedAt", "memberCount", "name", "onlineCount", "tags"]);
  assert.equal(card.description, "server description", "falls back to the server description");
  assert.equal(card.language, "other");
  assert.equal(card.tags.length, 5);
  assert.ok(!JSON.stringify(card).includes("secret"), "no private fields");
  assert.ok(!JSON.stringify(card).includes("SECRET01"), "no invite code");

  // Query: filters, search, sort, paging
  const cards = [
    { id: "a", name: "Alpha", description: "Survival", category: "gaming-minecraft", language: "tr", tags: ["smp"], memberCount: 10, onlineCount: 1, listedAt: "2026-11-01" },
    { id: "b", name: "Beta", description: "Skyblock", category: "gaming-minecraft", language: "en", tags: [], memberCount: 30, onlineCount: 0, listedAt: "2026-11-05" },
    { id: "c", name: "Çalışma", description: "Ders", category: "study", language: "tr", tags: ["yks"], memberCount: 5, onlineCount: 4, listedAt: "2026-11-03" },
  ];
  assert.deepEqual(dir.queryCards(cards, {}).servers.map((c) => c.id), ["b", "a", "c"], "members by default");
  assert.deepEqual(dir.queryCards(cards, { sort: "online" }).servers.map((c) => c.id), ["c", "a", "b"]);
  assert.deepEqual(dir.queryCards(cards, { sort: "newest" }).servers.map((c) => c.id), ["b", "c", "a"]);
  assert.deepEqual(dir.queryCards(cards, { category: "gaming-minecraft" }).servers.map((c) => c.id), ["b", "a"]);
  assert.deepEqual(dir.queryCards(cards, { language: "tr" }).servers.map((c) => c.id), ["a", "c"]);
  assert.equal(dir.queryCards(cards, { category: "bogus" }).total, 0, "unknown category is empty");
  assert.equal(dir.queryCards(cards, { language: "bogus" }).total, 0);
  assert.deepEqual(dir.queryCards(cards, { q: "calisma" }).servers.map((c) => c.id), ["c"], "accent-insensitive search");
  assert.deepEqual(dir.queryCards(cards, { q: "SMP" }).servers.map((c) => c.id), ["a"], "tags are searched");
  const page = dir.queryCards(cards, { limit: 2 });
  assert.equal(page.nextOffset, 2);
  assert.equal(dir.queryCards(cards, { limit: 2, offset: 2 }).nextOffset, null);
  assert.equal(dir.queryCards(cards, { limit: 999 }).limit, dir.PAGE_MAX);

  const sum = dir.summarize(cards);
  assert.equal(sum["gaming-minecraft"].total, 2);
  assert.deepEqual(sum["gaming-minecraft"].byLanguage, { tr: 1, en: 1 });
  assert.equal(sum.art.total, 0);

  assert.ok(dir.isMissingSchemaError({ code: "42703", message: "column servers.listed_in_directory does not exist" }));
  assert.ok(dir.isMissingSchemaError({ code: "PGRST204" }));
  assert.ok(!dir.isMissingSchemaError({ code: "23505" }));

  console.log("serverDirectory.selftest ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
