"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const MAX_CODE = 24000;
const MAX_OUT = 32000;
const TIMEOUT_MS = 4000;

function pickPythonBin() {
  const fromEnv = String(process.env.PYTHON_BIN || "").trim();
  if (fromEnv) return fromEnv;
  return process.platform === "win32" ? "python" : "python3";
}

function clip(text) {
  const s = String(text || "");
  if (s.length <= MAX_OUT) return s;
  return `${s.slice(0, MAX_OUT)}\n… (output truncated)`;
}

/**
 * Run user Python in a short-lived isolated process. No secrets in env.
 * @param {string} code
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string, timedOut?: boolean, unavailable?: boolean }>}
 */
function runPythonSandbox(code) {
  const src = String(code || "");
  if (!src.trim()) {
    return Promise.resolve({ ok: false, stdout: "", stderr: "Empty code." });
  }
  if (src.length > MAX_CODE) {
    return Promise.resolve({ ok: false, stdout: "", stderr: "Code is too long to run." });
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dima-py-"));
  const file = path.join(dir, "main.py");
  fs.writeFileSync(file, src, "utf8");

  const bin = pickPythonBin();
  const args = ["-I", "-B", file];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    let child;
    try {
      child = spawn(bin, args, {
        cwd: dir,
        env: {
          PATH: "/usr/bin:/bin:/usr/local/bin",
          LANG: "C.UTF-8",
          PYTHONIOENCODING: "utf-8",
          PYTHONDONTWRITEBYTECODE: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      finish({
        ok: false,
        stdout: "",
        stderr: "Python runtime is not available on this server.",
        unavailable: true,
      });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish({
        ok: false,
        stdout: clip(stdout),
        stderr: clip(stderr || "Timed out after 4 seconds."),
        timedOut: true,
      });
    }, TIMEOUT_MS);

    child.stdout.on("data", (buf) => {
      stdout += buf.toString("utf8");
      if (stdout.length > MAX_OUT + 1024) stdout = stdout.slice(0, MAX_OUT + 1024);
    });
    child.stderr.on("data", (buf) => {
      stderr += buf.toString("utf8");
      if (stderr.length > MAX_OUT + 1024) stderr = stderr.slice(0, MAX_OUT + 1024);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      const missing = err && (err.code === "ENOENT" || /not found/i.test(String(err.message || "")));
      finish({
        ok: false,
        stdout: clip(stdout),
        stderr: missing
          ? "Python runtime is not available on this server."
          : clip(stderr || err.message || "Could not start Python."),
        unavailable: Boolean(missing),
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        stdout: clip(stdout),
        stderr: clip(stderr),
        exitCode: code,
      });
    });
  });
}

module.exports = {
  runPythonSandbox,
  MAX_CODE,
  TIMEOUT_MS,
};
