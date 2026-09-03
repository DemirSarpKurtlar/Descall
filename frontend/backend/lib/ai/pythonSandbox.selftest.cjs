/**
 * Run: node frontend/backend/lib/ai/pythonSandbox.selftest.cjs
 */
"use strict";

const assert = require("assert");
const { runPythonSandbox } = require("./pythonSandbox.cjs");

(async () => {
  const ok = await runPythonSandbox("print(1+1)");
  assert.equal(ok.ok, true, `expected success, got ${JSON.stringify(ok)}`);
  assert.match(String(ok.stdout), /2/);

  const boom = await runPythonSandbox("raise ValueError('nope')");
  assert.equal(boom.ok, false);
  assert.match(String(boom.stderr), /ValueError|nope/);

  const empty = await runPythonSandbox("   ");
  assert.equal(empty.ok, false);

  console.log("pythonSandbox.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
