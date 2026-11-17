"use strict";

/** node backend/lib/contentFilterCore.selftest.cjs */
const assert = require("assert");
const core = require("./contentFilterCore");

let n = 0;
function t(name, fn) {
  fn();
  n += 1;
}

t("parseInput detects the kind", () => {
  assert.deepStrictEqual(core.parseInput("Salak"), { pattern: "salak", kind: "word", error: null });
  assert.deepStrictEqual(core.parseInput("aptal*"), { pattern: "aptal", kind: "prefix", error: null });
  assert.deepStrictEqual(core.parseInput("/bedava\\s*nitro/"), { pattern: "bedava\\s*nitro", kind: "regex", error: null });
  assert.strictEqual(core.parseInput("İBNE").pattern, "ibne");
  assert.strictEqual(core.parseInput("bedava nitro").pattern, "bedava nitro");
  assert.strictEqual(core.parseInput("x*").error, "too_short");
  assert.strictEqual(core.parseInput("   ").error, "empty");
  assert.strictEqual(core.parseInput("a", "regex").error, null);
});

t("regex guard refuses risky shapes", () => {
  assert.strictEqual(core.regexProblem("(a+)+$"), "nested_quantifier");
  assert.strictEqual(core.regexProblem("(\\w*)*x"), "nested_quantifier");
  assert.strictEqual(core.regexProblem("(a)\\1"), "backreference");
  assert.strictEqual(core.regexProblem("[unclosed"), "invalid");
  assert.strictEqual(core.regexProblem("x".repeat(200)), "too_long");
  assert.strictEqual(core.regexProblem("d[i1l]sc[o0]rd\\.gift/\\w+"), null);
  assert.strictEqual(core.regexProblem("bedava\\s*nitro"), null);
});

const rules = [
  { id: "r1", pattern: "gerizekalı", kind: "word", severity: "high", action: "block_flag" },
  { id: "r2", pattern: "aptal", kind: "prefix", severity: "medium", action: "mask_flag" },
  { id: "r3", pattern: "d[i1l]sc[o0]rd\\.gift/\\w+", kind: "regex", severity: "high", action: "block_timeout", timeoutSeconds: 3600 },
  { id: "r4", pattern: "bedava\\s*nitro", kind: "regex", severity: "high", action: "block" },
  { id: "r5", pattern: "salak", kind: "word", severity: "low", action: "mask" },
  { id: "r6", pattern: "kötü söz", kind: "word", severity: "low", action: "mask" },
  { id: "gone", pattern: "silindi", kind: "word", severity: "high", action: "block", removedAt: "2026-11-01" },
  { id: "bad", pattern: "(a+)+", kind: "regex", severity: "high", action: "block" },
];
const compiled = core.compileRules(rules);

t("compile skips removed and unsafe rules", () => {
  assert.deepStrictEqual(compiled.skipped, ["bad"]);
  assert.strictEqual(core.matchText("silindi", compiled).length, 0);
});

t("word, prefix, phrase and regex matches with offsets", () => {
  const text = "selam, bedava nitro dağıtıyorum dlscord.gift/ab12 acele et aptallar";
  const m = core.matchText(text, compiled);
  assert.deepStrictEqual(m.map((x) => x.ruleId), ["r4", "r3", "r2"]);
  for (const x of m) assert.strictEqual(text.slice(x.start, x.end), x.text);
  assert.strictEqual(m[2].text, "aptallar");
  assert.strictEqual(m[2].pattern, "aptal*");
  const v = core.verdictOf(m);
  assert.strictEqual(v.block, true);
  assert.strictEqual(v.flag, true);
  assert.strictEqual(v.action, "block_timeout");
  assert.strictEqual(v.timeoutSeconds, 3600);
  assert.strictEqual(v.severity, "high");
  assert.strictEqual(v.count, 3);
});

t("case folding: Turkish capitals and whole words only", () => {
  assert.strictEqual(core.matchText("SALAK mısın", compiled).length, 1);
  assert.strictEqual(core.matchText("salakça değil salaklık", compiled).length, 0);
  assert.strictEqual(core.matchText("bu GERİZEKALI", compiled)[0].ruleId, "r1");
  assert.strictEqual(core.matchText("çok kötü   söz bu", compiled)[0].ruleId, "r6");
  assert.strictEqual(core.matchText("kötüsöz", compiled).length, 0);
});

t("verdict for mask-only matches does not block", () => {
  const v = core.verdictOf(core.matchText("sen tam bir salaksın ya salak", compiled));
  assert.strictEqual(v.block, false);
  assert.strictEqual(v.flag, false);
  assert.strictEqual(core.verdictOf([]), null);
});

t("ruleKindOf picks the strongest match", () => {
  const m = core.matchText("aptal ve dlscord.gift/x8K2", compiled);
  assert.strictEqual(core.ruleKindOf(m), "regex");
});

t("built-in list languages", () => {
  const out = core.defaultWordLanguages(["fuck*", "shit", "siktir*", "amk"]);
  assert.deepStrictEqual(out.map((x) => x.language), ["en", "en", "tr", "tr"]);
  assert.deepStrictEqual(core.wordToRule("Aptal*"), { pattern: "aptal", kind: "prefix" });
});

t("long text is read in windows, capped and never throws", () => {
  // A banned word after the first 4000 characters is still found (security scan 17 Nov 2026).
  const long = "a".repeat(20000) + " salak";
  const found = core.matchText(long, compiled);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(long.slice(found[0].start, found[0].end), "salak");
  // A word right on a window edge is found once.
  const edge = "b ".repeat(1948) + "salak " + "c".repeat(5000);
  assert.strictEqual(core.matchText(edge, compiled).length, 1);
  // Beyond the scan cap nothing is read, and nothing throws.
  assert.strictEqual(core.matchText("a".repeat(70000) + " salak", compiled).length, 0);
  assert.deepStrictEqual(core.matchText(null, compiled), []);
});

console.log(`contentFilterCore selftest: ${n} groups passed`);
