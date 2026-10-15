import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRecoveryCmd, assertDownloadedInstaller } from "./updateRecover.cjs";

const electronDir = path.dirname(fileURLToPath(import.meta.url));

function pe(machine) {
  const buf = Buffer.alloc(8 * 1024 * 1024 + 64);
  buf[0] = 0x4d;
  buf[1] = 0x5a;
  buf.writeInt32LE(0x80, 0x3c);
  buf[0x80] = 0x50;
  buf[0x81] = 0x45;
  buf.writeUInt16LE(machine, 0x84);
  return buf;
}

test("recovery script waits for the running exe before the installer", () => {
  const cmd = buildRecoveryCmd({
    installerPath: "C:\\Users\\Demir\\AppData\\Local\\Temp\\Descall-Setup-2.10.85.exe",
    bootOkPath: "C:\\Users\\Demir\\AppData\\Roaming\\Descall\\boot-ok",
    version: "2.10.85",
    forceRun: true,
    productExe: "Descall.exe",
  });
  const waitAt = cmd.indexOf("IsRunning()");
  const runAt = cmd.indexOf("RunSetup");
  assert.ok(waitAt >= 0 && runAt > waitAt);
  assert.match(cmd, /Win32_Process WHERE Name=/);
  assert.match(cmd, /exeName = "Descall\.exe"/);
  assert.match(cmd, /\/S /);
  assert.match(cmd, /--updated --force-run/);
  assert.match(cmd, /--descall-clean=1 --updated --force-run/);
  assert.match(cmd, /Function Poll\(\)/);
  assert.match(cmd, /Descall-Setup\.exe/);
  assert.equal(cmd.includes("find /I"), false);
  assert.equal(cmd.includes("tasklist"), false);
  assert.equal(cmd.includes("cmd.exe"), false);
  assert.equal(cmd.includes("findstr"), false);
});

test("a quiet quit does not force the app back open", () => {
  const cmd = buildRecoveryCmd({
    installerPath: "C:\\setup.exe",
    bootOkPath: "C:\\boot-ok",
    version: "2.10.85",
    forceRun: false,
  });
  assert.equal(cmd.includes("--force-run"), false);
  assert.match(cmd, /--descall-clean=1 --updated/);
  assert.match(cmd, /If RunSetup\("--updated"\) = 0 Then WScript\.Quit 0/);
  assert.equal(cmd.includes("If Poll()"), false);
  assert.equal(cmd.includes("find /I"), false);
});

test("installer and process scan never shell out to find.exe", () => {
  const nsh = fs.readFileSync(path.join(electronDir, "installer.nsh"), "utf8")
    .split("\n")
    .filter((line) => !/^\s*;/.test(line))
    .join("\n");
  const scanner = fs.readFileSync(path.join(electronDir, "processScanner.cjs"), "utf8")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
  assert.equal(nsh.includes("find /I"), false);
  assert.equal(nsh.includes("find.exe"), false);
  assert.equal(nsh.includes("cmd.exe"), false);
  assert.equal(/nsExec::Exec(?!ToStack)/.test(nsh), false);
  assert.match(nsh, /nsExec::ExecToStack/);
  assert.match(nsh, /CreateToolhelp32Snapshot/);
  assert.match(scanner, /execFile\(/);
  assert.match(scanner, /windowsHide:\s*true/);
  assert.equal(/\bexec\(/.test(scanner), false);
  assert.equal(scanner.includes("find /I"), false);
});

test("a short or non-PE download is refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descall-setup-"));
  const file = path.join(dir, "setup.exe");
  fs.writeFileSync(file, Buffer.from("MZ"));
  assert.throws(() => assertDownloadedInstaller(file), /too small|not a Windows executable/);
  fs.writeFileSync(file, pe(0x14c));
  const info = assertDownloadedInstaller(file);
  assert.equal(info.machine, 0x14c);
  assert.throws(() => assertDownloadedInstaller(file, info.size + 1), /incomplete/);
});
