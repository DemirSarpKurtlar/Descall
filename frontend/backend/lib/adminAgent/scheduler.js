"use strict";

/**
 * Admin agent scheduler (phase 2). Every 30 s:
 *  - plans.tick(): resumes a running plan whose runner died with the process, and starts
 *    approved plans whose scheduled time has come ("Zamanla");
 *  - due scheduled tasks: the task's prompt goes through the normal chat loop as the admin
 *    who created it, inside that admin's session (session_id stored at creation). The run can
 *    read and propose a plan; it never applies anything (approval stays with an admin).
 *    When that session is signed out the task stops with last_status "session_ended".
 * Started from server.js outside tests.
 */

const store = require("./planStore");
const model = require("./planModel");
const plans = require("./plans");

const TICK_MS = 30 * 1000;
const TASK_LEASE_MS = 10 * 60 * 1000;
let timer = null;
let busy = false;
let getIoRef = () => null;
let runChatOverride = null;

async function sessionAlive(adminId, sid) {
  if (!sid) return false;
  try {
    const { sessionAllowed } = require("../sessionGuard");
    const r = await sessionAllowed({ sub: adminId, sid, iat: Math.floor(Date.now() / 1000) });
    return Boolean(r?.ok);
  } catch {
    return false;
  }
}

async function runTask(task, now = Date.now()) {
  if (!(await store.claimTask(task.id, TASK_LEASE_MS))) return null;
  const next = model.nextRunAt({ every: task.every, atMinute: task.at_minute, weekday: task.weekday }, now);
  if (!(await sessionAlive(task.admin_id, task.session_id))) {
    await store.updateTask(task.id, { enabled: false, last_status: "session_ended", last_error: null, lease_until: null, next_run_at: null });
    return { status: "session_ended" };
  }
  const { signToken } = require("../../config/jwt");
  const admin = { id: task.admin_id, username: task.admin_username || "admin" };
  // Loopback only: the token never leaves this process and carries the admin's own session.
  const authHeader = `Bearer ${signToken({ id: admin.id, username: admin.username, sid: task.session_id })}`;
  let threadId = null;
  let planId = null;
  let error = null;
  const runChat = runChatOverride || require("./run").runChat;
  try {
    await runChat({
      adminUser: admin,
      authHeader,
      threadId: null,
      text: `${task.prompt}\n\n(Scheduled task "${task.title}". If something needs doing, propose a plan; nothing is applied until an admin approves it.)`,
      onEvent: (e) => {
        if (e.type === "thread") threadId = e.threadId;
        if (e.type === "plan") planId = e.planId;
        if (e.type === "error") error = e.code || "error";
      },
      mode: "dry",
      source: "task",
      taskId: task.id,
    });
  } catch (err) {
    error = err?.code || "error";
    console.warn("[admin-agent] scheduled task failed:", err?.message || err);
  }
  await store.updateTask(task.id, {
    last_run_at: new Date(now).toISOString(),
    last_status: error ? "error" : planId ? "plan" : "ok",
    last_error: error,
    last_plan_id: planId,
    last_thread_id: threadId,
    run_count: (task.run_count || 0) + 1,
    next_run_at: next,
    lease_until: null,
  });
  return { status: error ? "error" : planId ? "plan" : "ok", planId, threadId };
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const io = getIoRef();
    if (io) plans.setIo(io);
    await plans.tick().catch((e) => console.warn("[admin-agent] plan tick failed:", e?.message || e));
    const due = await store.dueTasks(new Date());
    for (const t of due) await runTask(t).catch((e) => console.warn("[admin-agent] task run failed:", e?.message || e));
  } finally {
    busy = false;
  }
}

function start({ getIo } = {}) {
  if (timer) return;
  if (typeof getIo === "function") getIoRef = getIo;
  timer = setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  timer.unref?.();
  setTimeout(() => { tick().catch(() => {}); }, 5000).unref?.();
}

/** Run a tick soon (after "run now"). */
function kick() {
  setTimeout(() => { tick().catch(() => {}); }, 200).unref?.();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function __setForTests({ runChat } = {}) {
  runChatOverride = runChat || null;
}

module.exports = { start, stop, tick, kick, runTask, sessionAlive, __setForTests };
