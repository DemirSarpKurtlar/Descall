/**
 * Windows PE machine field. Used to reject a mixed-arch update
 * (0xc000007b / STATUS_INVALID_IMAGE_FORMAT).
 */
const fs = require("fs");
const path = require("path");

const MACHINE = {
  0x14c: "ia32",
  0x8664: "x64",
  0xaa64: "arm64",
};

function readPeMachine(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (n < 64 || buf[0] !== 0x4d || buf[1] !== 0x5a) return null;
    const pe = buf.readInt32LE(0x3c);
    if (pe < 0 || pe + 6 > n) return null;
    if (buf[pe] !== 0x50 || buf[pe + 1] !== 0x45 || buf[pe + 2] !== 0 || buf[pe + 3] !== 0) return null;
    return buf.readUInt16LE(pe + 4);
  } finally {
    fs.closeSync(fd);
  }
}

function machineName(machine) {
  if (machine == null) return "invalid";
  return MACHINE[machine] || `0x${machine.toString(16)}`;
}

function scanNativeImages(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...scanNativeImages(full));
      continue;
    }
    if (/\.(exe|dll|node)$/i.test(ent.name)) {
      out.push({ file: full, name: ent.name, machine: readPeMachine(full) });
    }
  }
  return out;
}

function assertArch(dir, expectMachine, requiredNames) {
  const rows = scanNativeImages(dir);
  const errors = [];
  for (const row of rows) {
    if (row.machine !== expectMachine) {
      errors.push(`${row.file} is ${machineName(row.machine)}, expected ${machineName(expectMachine)}`);
    }
  }
  for (const name of requiredNames || []) {
    const hit = rows.find((row) => row.name.toLowerCase() === String(name).toLowerCase());
    if (!hit) errors.push(`missing ${name}`);
    else if (hit.machine !== expectMachine) errors.push(`${name} is ${machineName(hit.machine)}`);
  }
  return { rows, errors };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dirFlag = args.indexOf("--dir");
  const dir = dirFlag >= 0 ? args[dirFlag + 1] : "";
  const expectFlag = args.indexOf("--expect");
  const expect = expectFlag >= 0 ? Number(args[expectFlag + 1]) : 0x8664;
  const reqFlag = args.indexOf("--require");
  const required = reqFlag >= 0 ? String(args[reqFlag + 1] || "").split(",").filter(Boolean) : ["Descall.exe", "ffmpeg.dll"];
  if (!dir) {
    console.error("usage: node peArch.cjs --dir <win-unpacked> [--expect 34404] [--require Descall.exe,ffmpeg.dll]");
    process.exit(2);
  }
  const { rows, errors } = assertArch(dir, expect, required);
  const vcr = rows.find((row) => row.name.toLowerCase() === "vcruntime140.dll");
  console.log(`[pe-arch] ${rows.length} native images, vcruntime140=${vcr ? machineName(vcr.machine) : "missing"}`);
  if (!vcr) errors.push("missing vcruntime140.dll (Electron must ship the VC++ runtime next to Descall.exe)");
  if (errors.length) {
    for (const err of errors) console.error(`[pe-arch] ${err}`);
    process.exit(1);
  }
  console.log("[pe-arch] ok");
}

module.exports = {
  MACHINE,
  readPeMachine,
  machineName,
  scanNativeImages,
  assertArch,
};
