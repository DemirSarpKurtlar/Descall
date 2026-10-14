"use strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-test-secret-test-secret-xx";

const jwt = require("jsonwebtoken");
const supabase = require("../db/supabase");
const { socketAuthMiddleware } = require("./socketAuth");
const ageGate = require("../lib/ageGate");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function socketFor(token) {
  return {
    handshake: {
      auth: { token },
      headers: {},
      address: "203.0.113.8",
    },
  };
}

supabase.from = () => ({
  select() { return this; },
  eq() { return this; },
  maybeSingle: async () => ({ data: { active_sessions: [{ id: "sid-1" }] }, error: null }),
});

const token = jwt.sign({ sub: "user-1", username: "ada", sid: "sid-1" }, process.env.JWT_SECRET);

ageGate.enforceChildClosure = () => Promise.reject(new Error("age lookup exploded"));

const socket = socketFor(token);
socketAuthMiddleware(socket, (err) => {
  assert(err instanceof Error, "rejection reaches next(err)");
  assert(!socket.user, "a thrown session check must not authenticate the socket");
  assert(!/assign/.test(String(err && err.message)), "error is an auth failure");
  console.log("socketAuthFailClosed.selftest.cjs: ok");
});
