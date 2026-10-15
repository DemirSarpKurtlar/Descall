import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildRecoveryCmd, assertDownloadedInstaller } from "./updateRecover.cjs";

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
  const waitAt = cmd.indexOf(":wait");
  const taskAt = cmd.indexOf("tasklist");
  const callAt = cmd.indexOf("call :install");
  assert.ok(waitAt >= 0 && taskAt > waitAt && callAt > taskAt);
  assert.match(cmd, /tasklist \/FI "IMAGENAME eq %EXE%"/);
  assert.match(cmd, /taskkill \/f \/im "%EXE%"/);
  assert.match(cmd, /"%SETUP%" \/S %1 %2 %3/);
  assert.equal(cmd.includes("%*"), false);
  assert.match(cmd, /--updated --force-run/);
  assert.match(cmd, /--descall-clean=1 --updated --force-run/);
  assert.match(cmd, /call :poll/);
  assert.match(cmd, /Descall-Setup\.exe/);
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
  assert.match(cmd, /if not errorlevel 1 goto done/);
  assert.equal(cmd.includes("call :poll"), false);
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
