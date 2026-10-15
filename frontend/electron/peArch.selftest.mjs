import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPeMachine, machineName, assertArch } from "./peArch.cjs";

function pe(machine) {
  const buf = Buffer.alloc(256);
  buf[0] = 0x4d;
  buf[1] = 0x5a;
  buf.writeInt32LE(0x80, 0x3c);
  buf[0x80] = 0x50;
  buf[0x81] = 0x45;
  buf.writeUInt16LE(machine, 0x84);
  return buf;
}

test("reads the PE machine field", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descall-pe-"));
  const file = path.join(dir, "ffmpeg.dll");
  fs.writeFileSync(file, pe(0x8664));
  assert.equal(readPeMachine(file), 0x8664);
  assert.equal(machineName(0x8664), "x64");
  fs.writeFileSync(file, pe(0x14c));
  assert.equal(readPeMachine(file), 0x14c);
  fs.writeFileSync(file, Buffer.from("MZ"));
  assert.equal(readPeMachine(file), null);
});

test("a directory of mixed images fails the x64 check", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "descall-pe-dir-"));
  fs.writeFileSync(path.join(dir, "Descall.exe"), pe(0x8664));
  fs.writeFileSync(path.join(dir, "ffmpeg.dll"), pe(0x14c));
  fs.writeFileSync(path.join(dir, "vcruntime140.dll"), pe(0x8664));
  const mixed = assertArch(dir, 0x8664, ["Descall.exe", "ffmpeg.dll", "vcruntime140.dll"]);
  assert.equal(mixed.errors.some((err) => err.includes("ffmpeg.dll")), true);
  fs.writeFileSync(path.join(dir, "ffmpeg.dll"), pe(0x8664));
  const ok = assertArch(dir, 0x8664, ["Descall.exe", "ffmpeg.dll", "vcruntime140.dll"]);
  assert.deepEqual(ok.errors, []);
});
