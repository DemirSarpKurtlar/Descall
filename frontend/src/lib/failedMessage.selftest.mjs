import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRetryable, retryEmit } from "./failedMessage.js";

const failed = { id: "temp-1", failed: true, text: "selam", replyTo: { id: "m9", text: "eski" } };
assert.equal(isRetryable({ ...failed, failed: false }, "dm"), false);
assert.equal(isRetryable(failed, "server"), false, "server channels keep their own flow");
assert.equal(isRetryable({ id: "x", failed: true, text: "  " }, "dm"), false);

let [ev, p] = retryEmit(failed, { conversationType: "dm", conversationId: "peer", tempId: "temp-2" });
assert.equal(ev, "dm:send");
assert.deepEqual(p, { toUserId: "peer", tempId: "temp-2", text: "selam", replyTo: { id: "m9" } }, "the quote goes as an id, the server reads it again");

[ev, p] = retryEmit({ id: "temp-3", failed: true, text: "", mediaUrl: "descall-media://a", mediaType: "voice", duration: 7 }, { conversationType: "group", conversationId: "g1", tempId: "temp-4" });
assert.equal(ev, "group:message");
assert.equal(p.content, "__voice__:7");
assert.equal(p.mediaType, "voice");
assert.equal(p.groupId, "g1");

[ev, p] = retryEmit({ id: "temp-5", failed: true, text: "", mediaUrl: "descall-media://b", mediaType: "image", originalName: "a.png", size: 9, mimeType: "image/png" }, { conversationType: "dm", conversationId: "peer", tempId: "t" });
assert.equal(p.originalName, "a.png");
assert.equal(retryEmit(failed, { conversationType: "dm", conversationId: "", tempId: "t" }), null);

// Wiring: the bubble shows the failed state, the app shell resends.
const here = dirname(fileURLToPath(import.meta.url));
const list = readFileSync(join(here, "../components/chat/MessageList.jsx"), "utf8");
assert.ok(list.includes('data-testid="msg-failed"'), "MessageList renders the failed row");
assert.ok(list.includes('requestFailedAction("retry"'), "retry is offered");
const app = readFileSync(join(here, "../App.jsx"), "utf8");
assert.ok(app.includes("FAILED_ACTION_EVENT") && app.includes("retryEmit("), "App resends a failed message");

// Polish messaging-15: a message request keeps the bubble, marked as a request.
assert.ok(app.includes("requestPending: true"), "dm:request:sent keeps the row");
assert.ok(list.includes('data-testid="msg-request-pending"'), "the row says it is a message request");

console.log("failedMessage selftest OK");
