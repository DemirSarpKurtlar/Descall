// Run: node frontend/src/lib/chatCache.selftest.mjs
import assert from "node:assert/strict";
import {
  buildChatSnapshot,
  CHAT_CACHE_LIMITS,
  hydrateChatCache,
  newestCursor,
  peekChatCache,
  reconcileHistoryWindow,
  rememberChatCache,
  resetChatCacheMemory,
  schedulePersistChatCache,
} from "./chatCache.js";

resetChatCacheMemory();

function msg(id, iso, extra = {}) {
  return { id, text: extra.text ?? id, timestamp: iso, ...extra };
}

const existing = [
  msg("m1", "2026-10-10T00:00:01.000Z", { text: "one" }),
  msg("m2", "2026-10-10T00:00:02.000Z", { text: "two" }),
  msg("m3", "2026-10-10T00:00:03.000Z", { text: "three" }),
  msg("temp-1", "2026-10-10T00:00:04.000Z", { text: "sending", sending: true }),
];

const edited = reconcileHistoryWindow(existing, [
  msg("m3", "2026-10-10T00:00:03.000Z", { text: "three edited" }),
  msg("m4", "2026-10-10T00:00:05.000Z", { text: "four" }),
], { incremental: true });
assert.deepEqual(edited.map((m) => m.id), ["m1", "m2", "m3", "temp-1", "m4"]);
assert.equal(edited.find((m) => m.id === "m3").text, "three edited");
assert.equal(edited.find((m) => m.id === "temp-1").sending, true);

const deleted = reconcileHistoryWindow(existing, [
  msg("m1", "2026-10-10T00:00:01.000Z", { text: "one" }),
  msg("m3", "2026-10-10T00:00:03.000Z", { text: "three" }),
], { incremental: false });
assert.deepEqual(deleted.map((m) => m.id), ["m1", "m3", "temp-1"]);

const keptOlder = reconcileHistoryWindow(
  [msg("old", "2026-10-09T00:00:00.000Z", { text: "older history" }), ...existing],
  [
    msg("m1b", "2026-10-10T00:00:01.000Z", { text: "anchor" }),
    msg("m3", "2026-10-10T00:00:03.000Z", { text: "three" }),
  ],
  { incremental: false },
);
assert.equal(keptOlder[0].id, "old");
assert.ok(!keptOlder.some((m) => m.id === "m1" || m.id === "m2"));
assert.ok(keptOlder.some((m) => m.id === "m3" && m.id));

assert.equal(
  reconcileHistoryWindow(existing, [], { incremental: true }).length,
  existing.length,
);
assert.deepEqual(
  reconcileHistoryWindow(existing, [], { incremental: false }).map((m) => m.id),
  ["temp-1"],
);

const raw = "amk test";
const snap = buildChatSnapshot("user-1", {
  servers: [{ id: "s1" }],
  ownedCount: 1,
  groups: [{ id: "g1" }],
  friends: [{ id: "f1" }],
  dmUnread: { f1: 2 },
  groupUnread: { g1: 1 },
  dmLastActivity: { f1: "2026-10-10T00:00:05.000Z" },
  dmByUserId: { f1: [msg("d1", "2026-10-10T00:00:05.000Z", { text: raw })] },
  groupMessagesById: {},
  channelMessagesById: {},
});
assert.equal(snap.messages.dm.f1[0].text, raw);
assert.equal(snap.dmUnread.f1, 2);
assert.equal(newestCursor(snap.messages.dm.f1), "2026-10-10T00:00:05.000Z");

const bulky = {};
for (let i = 0; i < CHAT_CACHE_LIMITS.MAX_CONVS + 1; i += 1) {
  const id = `c${String(i).padStart(2, "0")}`;
  bulky[id] = Array.from({ length: 80 }, (_, n) => msg(`${id}-${n}`, new Date(2026, 0, 1, 0, i, n).toISOString()));
}
const trimmed = buildChatSnapshot("user-1", {
  dmByUserId: bulky,
  dmLastActivity: Object.fromEntries(Object.keys(bulky).map((id) => [id, bulky[id].at(-1).timestamp])),
  groupMessagesById: {},
  channelMessagesById: {},
});
assert.equal(Object.keys(trimmed.messages.dm).length, CHAT_CACHE_LIMITS.MAX_CONVS);
assert.equal(trimmed.messages.dm.c12.length, CHAT_CACHE_LIMITS.MAX_PER_CONV);
assert.equal(trimmed.messages.dm.c00, undefined);

rememberChatCache("user-1", snap);
const paintStarted = performance.now();
for (let i = 0; i < 200; i += 1) peekChatCache("user-1");
const paintMs = performance.now() - paintStarted;
assert.ok(paintMs < 150, `memory paint ${paintMs}ms`);
assert.equal(peekChatCache("user-2"), null);

function installMemoryIdb() {
  const stores = new Map();
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: (name) => stores.has(name) },
          createObjectStore(name) { stores.set(name, new Map()); },
          transaction(name) {
            const map = stores.get(name);
            const tx = {
              objectStore() {
                return {
                  get(key) {
                    const result = {};
                    queueMicrotask(() => {
                      result.result = map.has(key) ? map.get(key) : null;
                      result.onsuccess?.();
                    });
                    return result;
                  },
                  put(value, key) { map.set(key, structuredClone(value)); },
                };
              },
            };
            queueMicrotask(() => { tx.oncomplete?.(); });
            return tx;
          },
          close() {},
        };
        request.result = db;
        if (!stores.has("kv")) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

installMemoryIdb();
resetChatCacheMemory();
schedulePersistChatCache("user-9", {
  servers: [{ id: "s1", name: "Sunucu" }],
  groups: [{ id: "g1", name: "Grup" }],
  friends: [{ id: "f1", username: "ada" }],
  dmByUserId: { f1: [msg("d1", "2026-10-10T01:00:00.000Z", { text: raw })] },
  groupMessagesById: { g1: [msg("gmsg", "2026-10-10T01:00:00.000Z", { text: "merhaba" })] },
  channelMessagesById: { ch1: [msg("cmsg", "2026-10-10T01:00:00.000Z", { text: "kanal" })] },
  dmUnread: { f1: 3 },
}, 0);

await new Promise((resolve) => setTimeout(resolve, 30));
resetChatCacheMemory();
const idbStarted = performance.now();
const hydrated = await hydrateChatCache("user-9");
const idbMs = performance.now() - idbStarted;
assert.ok(hydrated, "indexed snapshot missing");
assert.equal(hydrated.messages.dm.f1[0].text, raw);
assert.equal(hydrated.servers[0].name, "Sunucu");
assert.equal(hydrated.dmUnread.f1, 3);
assert.ok(idbMs < 150, `indexed paint ${idbMs}ms`);

const second = performance.now();
assert.equal(peekChatCache("user-9").groups[0].name, "Grup");
assert.ok(performance.now() - second < 150);

console.log(`chatCache.selftest: ok (memory x200 ${paintMs.toFixed(2)}ms, idb read ${idbMs.toFixed(2)}ms)`);
