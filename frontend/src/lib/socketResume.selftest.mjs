// node src/lib/socketResume.selftest.mjs
// Network handover probe (Android): a navigator.connection type change probes the
// socket and reconnects when the probe is not answered; estimate-only changes do nothing.
import assert from "node:assert/strict";

const listeners = {};
const target = () => ({
  addEventListener(ev, fn) { (listeners[ev] ||= new Set()).add(fn); },
  removeEventListener(ev, fn) { listeners[ev]?.delete(fn); },
});
globalThis.window = target();
globalThis.document = { ...target(), visibilityState: "visible" };

const { installSocketResumeWatchdog } = await import("./socketResume.js");

function fakeConnection(type) {
  const h = new Set();
  return {
    type,
    addEventListener(ev, fn) { if (ev === "change") h.add(fn); },
    removeEventListener(ev, fn) { if (ev === "change") h.delete(fn); },
    fire() { for (const fn of h) fn(); },
    size: () => h.size,
  };
}

function fakeSocket() {
  const s = {
    connected: true,
    active: true,
    disconnects: 0,
    connects: 0,
    pings: [],
    io: { engine: { readyState: "open", _pingInterval: 25000 } },
    on() {},
    off() {},
    disconnect() { s.disconnects += 1; s.connected = false; },
    connect() { s.connects += 1; },
    timeout(ms) { return { emit: (ev, ack) => s.pings.push({ ev, ms, ack }) }; },
  };
  return s;
}

const install = (socket, connection) =>
  installSocketResumeWatchdog(socket, { connection, log: () => {} });

// Wi-Fi -> cellular with a dead path: probe with the longer timeout, reconnect on timeout.
{
  const conn = fakeConnection("wifi");
  const socket = fakeSocket();
  const w = install(socket, conn);
  conn.type = "cellular";
  conn.fire();
  assert.equal(socket.pings.length, 1, "type change sends one probe");
  assert.equal(socket.pings[0].ev, "app:ping");
  assert.equal(socket.pings[0].ms, 3000);
  socket.pings[0].ack(new Error("timeout"));
  assert.equal(socket.disconnects, 1, "unanswered probe drops the dead engine");
  assert.equal(socket.connects, 1, "and reconnects at once");
  w.dispose();
  assert.equal(conn.size(), 0, "dispose removes the change listener");
}

// Live path: the ack arrives, nothing is torn down.
{
  const conn = fakeConnection("wifi");
  const socket = fakeSocket();
  const w = install(socket, conn);
  conn.type = "cellular";
  conn.fire();
  socket.pings[0].ack(null);
  assert.equal(socket.disconnects, 0);
  w.dispose();
}

// rtt / downlink estimate updates (same type) and "none" never probe.
{
  const conn = fakeConnection("wifi");
  const socket = fakeSocket();
  const w = install(socket, conn);
  conn.fire();
  conn.fire();
  conn.type = "none";
  conn.fire();
  assert.equal(socket.pings.length, 0);
  w.dispose();
}

// No navigator.connection (WebKit / iOS): installs and disposes without errors.
{
  const socket = fakeSocket();
  const w = install(socket, null);
  assert.equal(w.ensureFresh("check"), true);
  assert.equal(socket.pings.length, 0, "a soft check without a frozen gap does not probe");
  w.dispose();
}

console.log("socketResume selftest ok");
process.exit(0);
