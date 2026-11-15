"use strict";

/**
 * Sistem › Güvenli yeniden başlat (Draft A, frame A3). One run at a time:
 *   1 stop     new socket connections are refused, /health says "draining"   (at once)
 *   2 notify   every client shows a countdown strip (server:restarting)       (30 s, skippable)
 *   3 drain    direct sockets are closed in ten batches; edge clients stay on
 *              the Cloudflare hub and never move to this server               (~20 s)
 *   4 backup   memory backup size recorded (the admin's browser downloaded it
 *              before asking, when "Önce yedeği indir" was ticked)
 *   5 exit     the boot row gets who / why, then the process exits; Render starts
 *              a new one and clients reconnect by themselves                  (~40 s)
 * Progress goes to the admin room as admin:update { type: "system_restart", run }.
 */

const crypto = require("crypto");

const STEPS = Object.freeze(["stop", "notify", "drain", "backup", "exit"]);
const COUNTDOWN_SEC = 30;
const DRAIN_BATCHES = 10;
const DRAIN_GAP_MS = 2000;
const REASON_MIN = 5;
const REASON_MAX = 300;

/** The phrase to type, per app language (sysx.restart.confirmWord must match). */
const CONFIRM_WORDS = require("../i18n/systemRestart").confirmWords;

let run = null;
let middlewareInstalled = false;
let exitFn = (code) => process.exit(code);
let timingOverride = null;

function cleanText(v, max = REASON_MAX) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Typed confirmation: one of the phrases, spaces collapsed, case-insensitive. Pure, tested. */
function confirmMatches(typed) {
  const s = cleanText(typed, 64);
  if (!s) return false;
  const variants = new Set([s, s.toLocaleUpperCase("tr-TR"), s.toUpperCase()]);
  return Object.values(CONFIRM_WORDS).some((w) => variants.has(w));
}

function isDraining() {
  return Boolean(run && run.phase !== "failed");
}

function publicRun() {
  if (!run) return null;
  return {
    id: run.id,
    phase: run.phase,
    startedAt: run.startedAt,
    by: run.by,
    reason: run.reason,
    skipCountdown: run.skipCountdown,
    countdownSec: run.countdownSec,
    socketsAtStart: run.socketsAtStart,
    socketsLeft: run.socketsLeft,
    edgeSockets: run.edgeSockets,
    backupBytes: run.backupBytes,
    steps: run.steps.map((s) => ({ ...s })),
  };
}

function emitAdmin(io) {
  try {
    io?.to?.("admin")?.emit?.("admin:update", { type: "system_restart", run: publicRun() });
  } catch {
    /* no sockets */
  }
}

function setStep(key, status, extra = {}) {
  const s = run?.steps.find((x) => x.key === key);
  if (!s) return;
  s.status = status;
  s.at = new Date().toISOString();
  Object.assign(s, extra);
}

function directSockets(io, isEdgeSocket) {
  const out = [];
  try {
    for (const socket of io.of("/").sockets.values()) {
      if (isEdgeSocket && isEdgeSocket(socket)) continue;
      out.push(socket);
    }
  } catch {
    /* no io */
  }
  return out;
}

function installMiddleware(io) {
  if (middlewareInstalled || !io?.use) return;
  middlewareInstalled = true;
  io.use((_socket, next) => {
    if (isDraining()) return next(new Error("server_draining"));
    return next();
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start a run. Returns the public run at once; the steps continue in the background.
 * @param {object} p
 * @param {object} p.io
 * @param {{ id, username }} p.actor
 * @param {string} p.reason
 * @param {boolean} [p.skipCountdown]
 * @param {number} [p.backupBytes]   size of the backup the admin downloaded first
 * @param {Function} [p.isEdgeSocket]
 * @param {Function} [p.onBeforeExit] async ({ run }) => void  (boot row, audit)
 * @param {Function} [p.exit]        default process.exit
 * @param {object} [p.timing]        { countdownSec, gapMs } for tests
 */
function start({ io, actor, reason, skipCountdown = false, backupBytes = null, isEdgeSocket = null, onBeforeExit = null, exit = exitFn, timing = timingOverride || {} }) {
  if (run && run.phase !== "failed") {
    const err = new Error("A restart is already running.");
    err.status = 409;
    err.code = "RESTART_RUNNING";
    throw err;
  }
  const countdownSec = skipCountdown ? 0 : timing.countdownSec ?? COUNTDOWN_SEC;
  const gapMs = timing.gapMs ?? DRAIN_GAP_MS;
  const sockets = directSockets(io, isEdgeSocket);
  run = {
    id: crypto.randomUUID(),
    phase: "stop",
    startedAt: new Date().toISOString(),
    by: actor?.username || null,
    reason: cleanText(reason),
    skipCountdown: Boolean(skipCountdown),
    countdownSec,
    socketsAtStart: sockets.length,
    socketsLeft: sockets.length,
    edgeSockets: 0,
    backupBytes: Number.isFinite(Number(backupBytes)) && Number(backupBytes) > 0 ? Math.round(Number(backupBytes)) : null,
    steps: STEPS.map((key) => ({ key, status: "pending", at: null })),
  };
  try {
    run.edgeSockets = Number(require("../runtime/edgeRuntime").edgeStats()?.clients) || 0;
  } catch {
    run.edgeSockets = 0;
  }
  const mine = run;

  // 1. stop new connections
  installMiddleware(io);
  setStep("stop", "done");
  emitAdmin(io);

  (async () => {
    try {
      // 2. notify clients
      mine.phase = "notify";
      setStep("notify", "active");
      const endsAt = new Date(Date.now() + countdownSec * 1000).toISOString();
      try {
        io?.emit?.("server:restarting", { at: new Date().toISOString(), countdownSec, endsAt });
      } catch {
        /* ignore */
      }
      emitAdmin(io);
      if (countdownSec > 0) await wait(countdownSec * 1000);
      setStep("notify", "done");

      // 3. drain direct sockets in batches (admins last so they can watch)
      mine.phase = "drain";
      setStep("drain", "active");
      emitAdmin(io);
      const list = directSockets(io, isEdgeSocket).sort((a, b) => Number(io.of("/").adapter?.rooms?.get("admin")?.has(a.id) || 0) - Number(io.of("/").adapter?.rooms?.get("admin")?.has(b.id) || 0));
      const size = Math.max(1, Math.ceil(list.length / DRAIN_BATCHES));
      for (let i = 0; i < list.length; i += size) {
        for (const socket of list.slice(i, i + size)) {
          try {
            socket.emit("server:restarting", { at: new Date().toISOString(), countdownSec: 0, endsAt: new Date().toISOString(), now: true });
            socket.disconnect(true);
          } catch {
            /* gone */
          }
        }
        mine.socketsLeft = Math.max(0, list.length - (i + size));
        emitAdmin(io);
        if (i + size < list.length && gapMs > 0) await wait(gapMs);
      }
      mine.socketsLeft = 0;
      setStep("drain", "done");

      // 4. backup size
      mine.phase = "backup";
      setStep("backup", "done", { bytes: mine.backupBytes });

      // 5. exit
      mine.phase = "exit";
      setStep("exit", "active");
      if (onBeforeExit) {
        try {
          await onBeforeExit({ run: publicRun() });
        } catch {
          /* still exit */
        }
      }
      setTimeout(() => exit(0), 400).unref?.();
    } catch (err) {
      mine.phase = "failed";
      mine.error = String(err?.message || err);
    }
  })();

  return publicRun();
}

function status() {
  return publicRun();
}

function __resetForTests({ exit, timing } = {}) {
  run = null;
  middlewareInstalled = false;
  if (exit) exitFn = exit;
  timingOverride = timing || null;
}

module.exports = {
  STEPS,
  COUNTDOWN_SEC,
  REASON_MIN,
  REASON_MAX,
  CONFIRM_WORDS,
  confirmMatches,
  isDraining,
  start,
  status,
  cleanText,
  __resetForTests,
};
