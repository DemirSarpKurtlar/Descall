"use strict";

const { createFakeSupabase } = require("../test/fakeSupabase.cjs");
const store = require("./messageRequestStore");

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

function missingClient() {
  return {
    from() {
      const query = {
        upsert() { return query; },
        select() { return query; },
        eq() { return query; },
        delete() { return query; },
        maybeSingle() { return query; },
        then(resolve) {
          resolve({ data: null, error: { code: "42P01", message: "relation dm_message_requests does not exist" } });
        },
      };
      return query;
    },
  };
}

(async () => {
  store.resetMessageRequests();
  const preview = store.messageRequestPreview({ text: "hello there", mediaType: null, mediaUrl: null });
  assert(preview === "hello there", "text preview");
  assert(store.messageRequestPreview({ mediaType: "voice" }) === "Voice message", "voice preview");
  assert(store.messageRequestPreview({ mediaUrl: "https://cdn/a.png" }) === "Attachment", "media preview");

  const fake = createFakeSupabase({ dm_message_requests: [] });
  const saved = await store.upsertMessageRequest(fake, {
    fromUserId: "cara",
    toUserId: "bob",
    username: "cara",
    preview: "hi bob",
  });
  assert(saved && saved.id === "cara", "public id is the sender");
  assert(saved.preview === "hi bob", "preview stored");
  assert(fake._tables.dm_message_requests.rows.length === 1, "row persisted");

  const again = await store.upsertMessageRequest(fake, {
    fromUserId: "cara",
    toUserId: "bob",
    username: "cara",
    preview: "updated",
  });
  assert(again.preview === "updated", "upsert replaces preview");
  assert(fake._tables.dm_message_requests.rows.length === 1, "still one row");

  store.resetMessageRequests();
  const listed = await store.listMessageRequests(fake, "bob");
  assert(listed.length === 1 && listed[0].preview === "updated", "list hydrates from the table");

  const removed = await store.deleteMessageRequest(fake, "cara", "bob");
  assert(removed && removed.id === "cara", "delete returns the request");
  assert((await store.listMessageRequests(fake, "bob")).length === 0, "inbox empty after decline");
  assert(fake._tables.dm_message_requests.rows.length === 0, "row deleted");

  store.resetMessageRequests();
  const mem = await store.upsertMessageRequest(missingClient(), {
    fromUserId: "cara",
    toUserId: "bob",
    username: "cara",
    preview: "offline table",
  });
  assert(mem && mem.preview === "offline table", "missing table still records the request");
  const memList = await store.listMessageRequests(missingClient(), "bob");
  assert(memList.length === 1, "missing table still lists from memory");

  console.log("messageRequestStore.selftest: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
