// One LiveKit room per server voice session (feedback 2026-11-22, "2 sesli sohbet birden
// katılıyo"): a join left or replaced while its room was still connecting must never
// leave that room connected next to the new one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  abandonPendingRooms,
  adoptConnectedRoom,
  dropPendingRoom,
  isLiveRoom,
  trackPendingRoom,
} from "./liveKitRoomSlot.js";

const here = dirname(fileURLToPath(import.meta.url));

class FakeRoom {
  constructor(name) {
    this.name = name;
    this.connected = false;
    this.disconnects = 0;
    this._resolve = null;
  }
  connect() {
    return new Promise((resolve) => {
      this._resolve = () => {
        this.connected = true;
        resolve();
      };
    });
  }
  finish() {
    this._resolve?.();
  }
  disconnect() {
    this.disconnects += 1;
    this.connected = false;
  }
}

/** The hook's session model: same calls in the same order as useServerVoice. */
function session() {
  const slot = { current: null };
  const pending = new Set();
  let channel = null;
  return {
    slot,
    pending,
    get channel() {
      return channel;
    },
    leave() {
      // cleanupAll -> disconnectLiveKit
      abandonPendingRooms(pending);
      const room = slot.current;
      slot.current = null;
      room?.disconnect();
      channel = null;
    },
    async join(channelId, room) {
      if (channel) this.leave();
      channel = channelId;
      trackPendingRoom(pending, room);
      const connecting = room.connect();
      return {
        room,
        settle: async () => {
          room.finish();
          await connecting;
          return adoptConnectedRoom({ slot, pending, room, wanted: channel === channelId });
        },
      };
    },
  };
}

// 1) Switch A -> B while A is still connecting; A connects after B started.
{
  const s = session();
  const a = new FakeRoom("A");
  const b = new FakeRoom("B");
  const joinA = await s.join("A", a);
  const joinB = await s.join("B", b);
  assert.equal(await joinA.settle(), false, "A finished after the switch: not adopted");
  assert.equal(a.connected, false, "A is disconnected, not left running next to B");
  assert.ok(a.disconnects >= 1);
  assert.equal(await joinB.settle(), true);
  assert.equal(s.slot.current, b);
  assert.equal(b.connected, true);
}

// 2) Same switch, but B connects first and A last (slow first SDK load).
{
  const s = session();
  const a = new FakeRoom("A");
  const b = new FakeRoom("B");
  const joinA = await s.join("A", a);
  const joinB = await s.join("B", b);
  assert.equal(await joinB.settle(), true);
  assert.equal(await joinA.settle(), false);
  assert.equal(s.slot.current, b, "the late A never replaces B");
  assert.equal(a.connected, false);
  assert.equal(b.connected, true);
}

// 3) Leave while connecting: nothing stays connected.
{
  const s = session();
  const a = new FakeRoom("A");
  const joinA = await s.join("A", a);
  s.leave();
  assert.equal(await joinA.settle(), false);
  assert.equal(s.slot.current, null);
  assert.equal(a.connected, false);
}

// 4) Leave A and rejoin A at once: the first attempt's room is closed, the second wins.
{
  const s = session();
  const a1 = new FakeRoom("A1");
  const a2 = new FakeRoom("A2");
  const first = await s.join("A", a1);
  s.leave();
  const second = await s.join("A", a2);
  assert.equal(await first.settle(), false, "abandoned by the leave even though A is wanted again");
  assert.equal(await second.settle(), true);
  assert.equal(s.slot.current, a2);
  assert.equal(a1.connected, false);
}

// 5) Adopting a room always disconnects a different current one.
{
  const slot = { current: new FakeRoom("old") };
  const old = slot.current;
  old.connected = true;
  const pending = new Set();
  const room = trackPendingRoom(pending, new FakeRoom("new"));
  assert.equal(adoptConnectedRoom({ slot, pending, room, wanted: true }), true);
  assert.equal(old.connected, false);
  assert.equal(old.disconnects, 1);
}

// 6) isLiveRoom / dropPendingRoom.
{
  const slot = { current: null };
  const pending = new Set();
  const r = trackPendingRoom(pending, new FakeRoom("r"));
  assert.equal(isLiveRoom(slot, pending, r), true);
  dropPendingRoom(pending, r);
  assert.equal(isLiveRoom(slot, pending, r), false);
  assert.equal(r.disconnects, 1);
  assert.equal(abandonPendingRooms(pending), 0);
}

// 7) The hook uses it: connect goes through the slot, leave abandons pending rooms, a
//    superseded connect never disconnects the newer session's room.
{
  const src = readFileSync(join(here, "../hooks/useServerVoice.js"), "utf8");
  const connect = src.slice(src.indexOf("const connectLiveKitRoom = useCallback("), src.indexOf("const restoreLiveKitRights"));
  assert.match(connect, /trackPendingRoom\(liveKitPendingRef\.current, new Room\(/, "a new room is tracked as pending");
  assert.match(connect, /adoptConnectedRoom\(\{ slot: liveKitRoomRef, pending: liveKitPendingRef\.current, room, wanted: activeChannelIdRef\.current === channelId \}\)/);
  assert.doesNotMatch(connect, /liveKitRoomRef\.current = room/, "the room is adopted only through adoptConnectedRoom");
  assert.match(connect, /room\.on\(RoomEvent\.TrackSubscribed, \(track, publication, participant\) => \{\s*if \(!live\(\)\)/);
  const disconnect = src.slice(src.indexOf("const disconnectLiveKit = useCallback("), src.indexOf("const cleanupPeer = useCallback("));
  assert.match(disconnect, /abandonPendingRooms\(liveKitPendingRef\.current\)/);
  assert.match(src, /if \(!stillJoining\(\) \|\| sfuErr\?\.code === "LIVEKIT_SUPERSEDED"\) return;/);
}

console.log("liveKitRoomSlot selftest ok");
