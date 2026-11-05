"use strict";

/**
 * Multi-device message fan-out (iOS → Electron / web).
 * Run: node frontend/backend/lib/messageFanout.selftest.cjs
 */

const assert = require("assert");
const {
  emitToUserRoom,
  emitToUserRoomExcept,
  fanoutDmMessage,
  fanoutOwnMessageToOtherDevices,
} = require("./messageFanout");

function makeIo() {
  const sockets = new Map();
  const rooms = new Map();
  return {
    sockets: { adapter: { rooms }, sockets },
    to(room) {
      return {
        emit(event, payload) {
          const ids = rooms.get(room);
          if (!ids) return;
          for (const id of ids) sockets.get(id)?.emit(event, payload);
        },
        except(exceptId) {
          return {
            emit(event, payload) {
              const ids = rooms.get(room);
              if (!ids) return;
              for (const id of ids) {
                if (id === exceptId) continue;
                sockets.get(id)?.emit(event, payload);
              }
            },
          };
        },
      };
    },
    _add(socket, userId) {
      sockets.set(socket.id, socket);
      const room = `user:${userId}`;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(socket.id);
      socket.user = { id: userId };
    },
  };
}

function makeSocket(id) {
  const events = [];
  return {
    id,
    events,
    emit(name, payload) {
      events.push({ name, payload });
    },
  };
}

// --- emitToUserRoom reaches every device ---
{
  const io = makeIo();
  const ios = makeSocket("ios");
  const electron = makeSocket("electron");
  const web = makeSocket("web");
  io._add(ios, "alice");
  io._add(electron, "alice");
  io._add(web, "alice");
  emitToUserRoom(io, "alice", "dm:message", { id: "m1", text: "hi" });
  assert.equal(ios.events.length, 1);
  assert.equal(electron.events.length, 1);
  assert.equal(web.events.length, 1);
  assert.equal(electron.events[0].payload.text, "hi");
}

// --- emitToUserRoomExcept skips the sending socket ---
{
  const io = makeIo();
  const ios = makeSocket("ios");
  const electron = makeSocket("electron");
  io._add(ios, "alice");
  io._add(electron, "alice");
  emitToUserRoomExcept(io, "alice", "ios", "group:message", { groupId: "g1", message: { id: "m2" } });
  assert.equal(ios.events.length, 0, "sending iOS socket is skipped");
  assert.equal(electron.events.length, 1, "Electron still receives");
  assert.equal(electron.events[0].payload.message.id, "m2");
}

// --- fanoutDmMessage: peer + all sender devices (platform=ios and unknown) ---
{
  const io = makeIo();
  const ios = makeSocket("ios");
  const electron = makeSocket("electron");
  const bob = makeSocket("bob-web");
  io._add(ios, "alice");
  io._add(electron, "alice");
  io._add(bob, "bob");
  fanoutDmMessage(io, {
    senderId: "alice",
    peerId: "bob",
    messagePayload: { id: "m3", from: { id: "alice" }, text: "from ios", client: "ios" },
    tempId: "temp-ios-1",
  });
  const bobMsg = bob.events.find((e) => e.name === "dm:message");
  assert(bobMsg, "peer receives dm:message");
  assert.equal(bobMsg.payload.convWith, "alice");
  assert.equal(bobMsg.payload.text, "from ios");
  assert(!bobMsg.payload.tempId, "peer does not get sender tempId");

  const iosMsg = ios.events.find((e) => e.name === "dm:message");
  const elMsg = electron.events.find((e) => e.name === "dm:message");
  assert(iosMsg, "sending iOS device receives echo");
  assert(elMsg, "Electron (same user, other device) receives echo");
  assert.equal(iosMsg.payload.tempId, "temp-ios-1");
  assert.equal(elMsg.payload.tempId, "temp-ios-1");
  assert.equal(elMsg.payload.convWith, "bob");
  assert.equal(elMsg.payload.client, "ios");
}

// --- fanoutDmMessage with missing/unknown client field still fans out ---
{
  const io = makeIo();
  const a1 = makeSocket("a1");
  const a2 = makeSocket("a2");
  const b = makeSocket("b");
  io._add(a1, "alice");
  io._add(a2, "alice");
  io._add(b, "bob");
  fanoutDmMessage(io, {
    senderId: "alice",
    peerId: "bob",
    messagePayload: { id: "m4", from: { id: "alice" }, text: "no client field" },
  });
  assert(a2.events.some((e) => e.name === "dm:message" && e.payload.id === "m4"));
  assert(b.events.some((e) => e.name === "dm:message" && e.payload.id === "m4"));
}

// --- fanoutOwnMessageToOtherDevices for group/channel ---
{
  const io = makeIo();
  const ios = makeSocket("ios");
  const electron = makeSocket("electron");
  io._add(ios, "alice");
  io._add(electron, "alice");
  fanoutOwnMessageToOtherDevices(io, {
    userId: "alice",
    exceptSocketId: ios.id,
    event: "group:message",
    payload: { groupId: "g1", message: { id: "gm1", content: "selam" } },
  });
  assert.equal(ios.events.length, 0);
  assert.equal(electron.events[0].name, "group:message");
  assert.equal(electron.events[0].payload.message.content, "selam");
}

console.log("messageFanout.selftest: ok");
