"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { CHAT_BUBBLE_CATALOG, RESERVED_EFFECT_KEYS, toSqlInsert } = require("../lib/chatBubbleCatalog");

const css = fs.readFileSync(
  path.join(__dirname, "../../src/styles/chat-bubbles-atelier.css"),
  "utf8"
);

const staticItems = CHAT_BUBBLE_CATALOG.filter((item) => !item.animated);
const animatedItems = CHAT_BUBBLE_CATALOG.filter((item) => item.animated);

assert.strictEqual(staticItems.length, 20, "expected 20 static bubbles");
assert.strictEqual(animatedItems.length, 20, "expected 20 animated bubbles");

const skus = new Set();
const keys = new Set();
for (const item of CHAT_BUBBLE_CATALOG) {
  assert.ok(!skus.has(item.sku), `duplicate sku ${item.sku}`);
  assert.ok(!keys.has(item.effect_key), `duplicate effect ${item.effect_key}`);
  skus.add(item.sku);
  keys.add(item.effect_key);
  assert.ok(item.effect_key.startsWith("atelier-"));
  assert.ok(!RESERVED_EFFECT_KEYS.includes(item.effect_key), item.effect_key);
  assert.ok(item.description.length > 40, item.sku);
  assert.ok(item.price_descoin >= 200 && item.price_descoin <= 700, item.sku);
  const selector = `.cosmetic-chat-bubble.bubble-${item.effect_key}`;
  assert.ok(css.includes(selector), `missing css for ${item.effect_key}`);
  const slug = item.effect_key.replace(/^atelier-/, "");
  const animRef = `animation: atelier-${slug}`;
  const keyframe = `@keyframes atelier-${slug}`;
  if (item.animated) {
    assert.ok(css.includes(animRef), `missing animation ${slug}`);
    assert.ok(css.includes(keyframe), `missing keyframes ${slug}`);
  } else {
    assert.ok(!css.includes(animRef), `static skin animates ${slug}`);
    assert.ok(!css.includes(keyframe), `static skin has keyframes ${slug}`);
  }
}

const sqlPath = path.join(__dirname, "../../../supabase/migrations/20260928_chat_bubble_atelier.sql");
const sql = fs.readFileSync(sqlPath, "utf8");
assert.strictEqual(sql.trim(), toSqlInsert().trim(), "SQL migration drifted from catalog");
for (const item of CHAT_BUBBLE_CATALOG) {
  assert.ok(sql.includes(item.sku));
  assert.ok(sql.includes("ON CONFLICT (sku) DO NOTHING"));
}

async function main() {
  process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
  process.env.SUPABASE_URL = "https://placeholder.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "placeholder-key";
  const { createFakeSupabase } = require("./fakeSupabase.cjs");
  const fake = createFakeSupabase({
    shop_items: [{ sku: CHAT_BUBBLE_CATALOG[0].sku, name: "already" }],
  });
  const supabasePath = require.resolve("../db/supabase");
  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fake };
  delete require.cache[require.resolve("../lib/shop")];
  const shop = require("../lib/shop");
  const created = await shop.ensureChatBubbleCatalog();
  assert.strictEqual(created, CHAT_BUBBLE_CATALOG.length - 1);
  const again = await shop.ensureChatBubbleCatalog();
  assert.strictEqual(again, 0);
  const rows = fake._tables.shop_items.rows.filter((row) => String(row.sku).startsWith("chat-bubble-atelier-"));
  assert.strictEqual(rows.length, CHAT_BUBBLE_CATALOG.length);
  const sample = rows.find((row) => row.sku === "chat-bubble-atelier-aurora");
  assert.strictEqual(sample.category, "chat_bubble");
  assert.strictEqual(sample.effect_key, "atelier-aurora");
  assert.strictEqual(sample.active, true);
  console.log("chatBubbleCatalog.test.cjs ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
