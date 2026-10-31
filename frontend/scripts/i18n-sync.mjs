#!/usr/bin/env node
/**
 * Translation round trip for one locale.
 *
 *   node scripts/i18n-sync.mjs export --locale=de --out=/tmp/i18n/de [--size=400]
 *     Writes part-001.json ... with every source string the locale still misses:
 *     [{ "k": key, "en": English text, "tr": Turkish text (context), "where": file }]
 *     A translator fills "t" on each entry (same {placeholders}; ICU plural allowed).
 *
 *   Translators may instead write out-NNN.json next to part-NNN.json:
 *     { "<row index in the part>": "translation", ... }
 *
 *   node scripts/i18n-sync.mjs validate --locale=de --in=/tmp/i18n/de [--part=003]
 *     Checks every out file: all rows answered, placeholders match English, plural /
 *     select well formed, no leftover English-only rows. Exit 1 with a list on failure.
 *
 *   node scripts/i18n-sync.mjs import --locale=de --in=/tmp/i18n/de
 *     Reads every *.json in the folder, keeps entries with a non-empty "t", and
 *     rewrites src/i18n/locales/<id>.js (nested paths -> nested, others -> phrases),
 *     merged with what the catalog already has. Run scripts/i18n-check.mjs after.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = await import(pathToFileURL(join(root, "scripts", "i18n-check.mjs")).href);

const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const cmd = process.argv[2];
const locale = args.locale;
if (!locale || !["export", "import", "validate"].includes(cmd)) {
  console.error("usage: i18n-sync.mjs export|import --locale=<id> --out|--in=<dir>");
  process.exit(2);
}

const getByPath = (obj, path) => {
  let cur = obj;
  for (const p of String(path).split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return typeof cur === "string" ? cur : undefined;
};

const catalogs = await check.loadCatalogs();
const en = catalogs.en;
const tr = catalogs.tr;
if (!catalogs[locale]) throw new Error(`unknown locale ${locale}`);

function isNestedKey(k) {
  return getByPath(en.nested, k) != null;
}

/** Rows with a translation "t", from part files with "t" and/or paired out files. */
function readTranslatedRows(dir, onlyPart) {
  const files = readdirSync(dir).filter((f) => /^part-\d+\.json$/.test(f)).sort();
  const result = [];
  for (const name of files) {
    const num = name.match(/\d+/)[0];
    if (onlyPart && num !== String(onlyPart).padStart(3, "0")) continue;
    const rows = JSON.parse(readFileSync(join(dir, name), "utf8"));
    let out = null;
    try {
      out = JSON.parse(readFileSync(join(dir, `out-${num}.json`), "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") throw new Error(`out-${num}.json: ${err.message}`);
    }
    rows.forEach((row, i) => {
      const t = out ? out[String(i)] : row.t;
      result.push({ ...row, t: typeof t === "string" ? t : "", part: num, i, hasOut: !!out });
    });
  }
  return result;
}

if (cmd === "validate") {
  const { messageArguments, isWellFormedMessage } = await import(pathToFileURL(join(root, "src", "i18n", "message.js")).href);
  const rows = readTranslatedRows(args.in, args.part);
  const problems = [];
  for (const r of rows) {
    if (!r.hasOut) continue;
    const where = `part ${r.part} #${r.i} ${JSON.stringify(r.k).slice(0, 60)}`;
    if (!r.t.trim()) {
      problems.push(`${where}: missing translation`);
      continue;
    }
    if (!isWellFormedMessage(r.t)) problems.push(`${where}: malformed braces / plural (plural needs "other")`);
    const want = messageArguments(r.en);
    const got = messageArguments(r.t);
    const extra = [...got].filter((a) => !want.has(a));
    const lost = [...want].filter((a) => !got.has(a));
    if (extra.length) problems.push(`${where}: unknown placeholder {${extra.join("}, {")}}`);
    if (lost.length) problems.push(`${where}: placeholder dropped {${lost.join("}, {")}}`);
  }
  const answered = rows.filter((r) => r.hasOut);
  if (problems.length) {
    console.error(problems.slice(0, 200).join("\n"));
    console.error(`${problems.length} problem(s) in ${answered.length} rows`);
    process.exit(1);
  }
  console.log(`ok: ${answered.length} rows checked`);
  process.exit(0);
}

if (cmd === "export") {
  const { report, codeKeys } = await check.checkCoverage();
  const missing = report[locale].missing;
  const size = Number(args.size) || 400;
  const out = args.out;
  mkdirSync(out, { recursive: true });
  const rows = missing.map((k) => ({
    k,
    en: getByPath(en.nested, k) ?? en.phrases[k] ?? k,
    tr: check.lookup(tr, en, k) ?? "",
    where: codeKeys.get(k) || (isNestedKey(k) ? "catalog" : "catalog phrase"),
  }));
  // Keep related strings together: by file, then key.
  rows.sort((a, b) => a.where.localeCompare(b.where) || a.k.localeCompare(b.k));
  let n = 0;
  for (let i = 0; i < rows.length; i += size) {
    n += 1;
    writeFileSync(join(out, `part-${String(n).padStart(3, "0")}.json`), `${JSON.stringify(rows.slice(i, i + size), null, 1)}\n`);
  }
  console.log(`${rows.length} strings -> ${n} parts in ${out}`);
} else {
  const dir = args.in;
  const nested = JSON.parse(JSON.stringify(catalogs[locale].nested || {}));
  const phrases = { ...(catalogs[locale].phrases || {}) };
  let added = 0;
  let skipped = 0;
  {
    for (const row of readTranslatedRows(dir)) {
      const t = row.t;
      if (!row.k || !t.trim()) {
        skipped += 1;
        continue;
      }
      if (isNestedKey(row.k)) {
        const parts = row.k.split(".");
        let cur = nested;
        for (const p of parts.slice(0, -1)) {
          if (typeof cur[p] !== "object" || cur[p] == null) cur[p] = {};
          cur = cur[p];
        }
        cur[parts[parts.length - 1]] = t;
      } else {
        phrases[row.k] = t;
      }
      added += 1;
    }
  }
  const sortDeep = (o) =>
    Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, o[k] && typeof o[k] === "object" ? sortDeep(o[k]) : o[k]])
    );
  const file = join(root, "src", "i18n", "locales", `${locale}.js`);
  const head = readFileSync(file, "utf8").split("export const nested")[0];
  writeFileSync(
    file,
    `${head}export const nested = ${JSON.stringify(sortDeep(nested), null, 2)};\n\nexport const phrases = ${JSON.stringify(
      sortDeep(phrases),
      null,
      2
    )};\n\nexport default { nested, phrases };\n`
  );
  console.log(`${locale}: ${added} translations written, ${skipped} rows without a translation`);
}
