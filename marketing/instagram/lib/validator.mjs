/**
 * Content guardrails. Nothing is rendered or posted unless validateScript() returns
 * no errors for the script and checkAgainstLog() finds no duplicate in the last posts.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import { REPO_ROOT, PIPELINE_DIR } from "./config.mjs";
import { buildCaption, captionHash } from "./caption.mjs";
import { VISUAL_TYPES, buildTimeline, onScreenTexts, resolveScript } from "./script.mjs";
import {
  extractHashtags,
  findPhrase,
  hasEmoji,
  isValidHashtag,
  normalizeForCompare,
  plainLine,
  wordCount,
} from "./text.mjs";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function loadScreenshotAllowlist(policy, pipelineDir = PIPELINE_DIR) {
  const p = join(pipelineDir, policy.screenshotAllowlist || "screenshots.json");
  if (!existsSync(p)) return {};
  const data = JSON.parse(readFileSync(p, "utf8"));
  delete data.$comment;
  return data;
}

function makeReader(repoRoot, readFile) {
  const cache = new Map();
  return (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    const abs = join(repoRoot, rel);
    let text = null;
    try {
      text = readFile ? readFile(abs) : existsSync(abs) ? readFileSync(abs, "utf8") : null;
    } catch {
      text = null;
    }
    cache.set(rel, text);
    return text;
  };
}

/**
 * The game integration retired in 2.13.0 must never come back in marketing either.
 * Built from parts, like frontend/src/noRetiredGameFeature.selftest.mjs, so this file
 * does not spell the names out.
 */
export const RETIRED_TERMS = Object.freeze([
  "valo" + "rant*",
  "ri" + "ot*",
  "lf" + "g",
  "takım " + "bul*",
  "takim " + "bul*",
  "looking for " + "group",
  "play " + "tab*",
  "play sek" + "me*",
  "oyna sek" + "me*",
]);

/** Phrase rules from the policy that apply to a text in a theme. */
function phraseViolation(text, theme, policy) {
  const retired = findPhrase(text, RETIRED_TERMS);
  if (retired) return "mentions the retired game integration (removed in 2.13.0)";
  for (const group of policy.bannedPhrases || []) {
    const hit = findPhrase(text, group.phrases);
    if (hit) return `"${hit}" is not allowed (${group.reason})`;
  }
  for (const group of policy.restrictedPhrases || []) {
    const applies =
      (Array.isArray(group.onlyThemes) && !group.onlyThemes.includes(theme)) ||
      (Array.isArray(group.notThemes) && group.notThemes.includes(theme));
    if (!applies) continue;
    const hit = findPhrase(text, group.phrases);
    if (hit) return `"${hit}" is not allowed in theme ${theme} (${group.reason})`;
  }
  return null;
}

/**
 * Validate one script. ctx: { policy, repoRoot?, screenshots?, readFile? }.
 * Returns an array of error strings (empty = valid).
 */
export function validateScript(raw, ctx) {
  const { policy } = ctx;
  const L = policy.limits;
  const repoRoot = ctx.repoRoot || REPO_ROOT;
  const read = ctx.reader || makeReader(repoRoot, ctx.readFile);
  const screenshots = ctx.screenshots || {};
  const errors = [];
  const err = (m) => errors.push(m);

  if (!raw || typeof raw !== "object") return ["script is not an object"];
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) err(`id must be kebab-case ascii (got ${JSON.stringify(raw.id)})`);
  if (!policy.themes || !Object.prototype.hasOwnProperty.call(policy.themes, raw.theme)) err(`unknown theme ${JSON.stringify(raw.theme)}`);
  if (!raw.hook || !Array.isArray(raw.hook.lines) || raw.hook.lines.length === 0) err("hook.lines is required");
  if (!Array.isArray(raw.scenes)) err("scenes must be an array");
  if (typeof raw.caption !== "string" || raw.caption.trim() === "") err("caption is required");
  if (errors.length) return errors;

  const s = resolveScript(raw);

  // Structure and lengths.
  if (s.hook.lines.length > L.maxHookLines) err(`hook has ${s.hook.lines.length} lines (max ${L.maxHookLines})`);
  if (s.scenes.length < L.minScenes || s.scenes.length > L.maxScenes) err(`scenes: ${s.scenes.length} (need ${L.minScenes}-${L.maxScenes})`);
  s.scenes.forEach((sc, i) => {
    if (!Array.isArray(sc.lines) || sc.lines.length === 0) err(`scenes[${i}].lines is required`);
    else if (sc.lines.length > L.maxLinesPerBlock) err(`scenes[${i}] has ${sc.lines.length} lines (max ${L.maxLinesPerBlock})`);
    if (sc.visual) {
      if (!VISUAL_TYPES.includes(sc.visual.type)) err(`scenes[${i}].visual.type ${JSON.stringify(sc.visual.type)} is unknown`);
      if (Array.isArray(sc.visual.items) && sc.visual.items.length > L.maxVisualItems) err(`scenes[${i}].visual has ${sc.visual.items.length} items (max ${L.maxVisualItems})`);
      if (sc.visual.type === "screenshot") {
        const shot = screenshots[sc.visual.ref];
        if (!shot) err(`scenes[${i}].visual.ref ${JSON.stringify(sc.visual.ref)} is not in the screenshot allowlist`);
        else {
          if (!existsSync(join(repoRoot, shot.file))) err(`screenshot file missing: ${shot.file}`);
          if (/discord|compare/i.test(shot.file)) err(`screenshot ${shot.file} may show a third-party logo`);
          const iphoneRule = (policy.restrictedPhrases || []).find((g) => (g.phrases || []).includes("iphone*"));
          if (shot.showsPhone && iphoneRule && (iphoneRule.notThemes || []).includes(s.theme)) err(`screenshot ${sc.visual.ref} shows the iPhone app; not allowed in theme ${s.theme}`);
        }
      }
      if (["chips", "keys", "channels", "voice", "roles", "toggles", "checklist", "steps"].includes(sc.visual.type) && !(Array.isArray(sc.visual.items) && sc.visual.items.length)) {
        err(`scenes[${i}].visual.items is required for ${sc.visual.type}`);
      }
      if (sc.visual.type === "stat" && (sc.visual.value == null || String(sc.visual.value).trim() === "")) err(`scenes[${i}].visual.value is required for stat`);
    }
  });
  if (!s.cta.lines.some((l) => plainLine(l).toLowerCase().includes(policy.ctaMustContain))) err(`cta must mention ${policy.ctaMustContain}`);

  // On-screen text: emoji, words per line, characters per line, phrases.
  for (const { path, text, kind } of onScreenTexts(s)) {
    if (hasEmoji(text)) err(`${path}: emoji are not allowed`);
    const words = wordCount(text);
    if (kind === "line") {
      if (words > L.maxWordsPerLine) err(`${path}: ${words} words (max ${L.maxWordsPerLine}): "${text}"`);
      if (text.length > L.maxCharsPerLine) err(`${path}: ${text.length} characters (max ${L.maxCharsPerLine}): "${text}"`);
    } else if (words > L.maxWordsPerVisualItem) {
      err(`${path}: ${words} words (max ${L.maxWordsPerVisualItem}): "${text}"`);
    }
    if (text.trim() === "") err(`${path}: empty text`);
    const v = phraseViolation(text, s.theme, policy);
    if (v) err(`${path}: ${v}`);
  }

  // Timing.
  const { segments, total } = buildTimeline(s);
  if (segments[0].end > L.maxHookSec) err(`hook lasts ${segments[0].end}s (max ${L.maxHookSec}s)`);
  if (total < L.minDurationSec || total > L.maxDurationSec) err(`duration ${total}s outside ${L.minDurationSec}-${L.maxDurationSec}s`);
  for (const seg of segments) {
    if (seg.end - seg.start < 1.2) err(`${seg.kind}[${seg.index}] is shorter than 1.2s`);
  }

  // Caption and hashtags.
  for (const tag of s.hashtags) {
    if (!isValidHashtag(tag)) err(`hashtag ${JSON.stringify(tag)} is malformed`);
  }
  if (new Set(s.hashtags.map((t) => t.toLocaleLowerCase("tr-TR"))).size !== s.hashtags.length) err("hashtags contain duplicates");
  const caption = buildCaption(s);
  if (caption.length > L.maxCaptionChars) err(`caption is ${caption.length} characters (max ${L.maxCaptionChars})`);
  const tags = extractHashtags(caption);
  if (tags.length < L.minHashtags || tags.length > L.maxHashtags) err(`caption has ${tags.length} hashtags (need ${L.minHashtags}-${L.maxHashtags})`);
  if (hasEmoji(caption)) err("caption: emoji are not allowed");
  const cv = phraseViolation(caption, s.theme, policy);
  if (cv) err(`caption: ${cv}`);
  if (s.title && hasEmoji(s.title)) err("title: emoji are not allowed");
  if (!["pad", "silence"].includes(s.audio)) err(`audio must be "pad" or "silence"`);

  // Every feature claim needs a repo file that proves it.
  if (!s.sources.length) err("sources: at least one claim with a proving repo file is required");
  const roots = (policy.sourceRoots || []).map((r) => normalize(r));
  s.sources.forEach((src, i) => {
    if (!src || typeof src.file !== "string" || typeof src.match !== "string" || typeof src.claim !== "string") {
      err(`sources[${i}] needs claim, file and match`);
      return;
    }
    const rel = normalize(src.file);
    if (isAbsolute(rel) || rel.startsWith("..")) {
      err(`sources[${i}].file must be repo-relative`);
      return;
    }
    if (roots.length && !roots.some((r) => rel === r || rel.startsWith(r + sep) || rel.startsWith(r + "/"))) {
      err(`sources[${i}].file ${rel} is outside the source roots (${roots.join(", ")})`);
      return;
    }
    const text = read(rel);
    if (text == null) {
      err(`sources[${i}].file ${rel} does not exist`);
      return;
    }
    if (src.match.trim().length < 3) {
      err(`sources[${i}].match is too short to prove anything`);
      return;
    }
    let re;
    try {
      re = new RegExp(src.match, "iu");
    } catch (e) {
      err(`sources[${i}].match is not a valid regex: ${e.message}`);
      return;
    }
    if (!re.test(text)) err(`sources[${i}]: ${rel} does not contain /${src.match}/ (claim: ${src.claim})`);
  });
  if (s.theme === "surum-notlari" && !s.sources.some((src) => String(src.file).startsWith("docs/release-notes/"))) {
    err("surum-notlari scripts must cite a docs/release-notes file");
  }

  return errors;
}

/** Validate the whole library; also catches duplicate ids, hooks and captions. */
export function validateLibrary(scripts, ctx) {
  const reader = ctx.reader || makeReader(ctx.repoRoot || REPO_ROOT, ctx.readFile);
  const results = scripts.map((s) => ({ id: s?.id, file: s?.__file, errors: validateScript(s, { ...ctx, reader }) }));
  const seen = { id: new Map(), hook: new Map(), caption: new Map() };
  scripts.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    const keys = {
      id: s.id,
      hook: normalizeForCompare((s.hook?.lines || []).join(" ")),
      caption: s.caption ? captionHash(buildCaption(resolveScript(s))) : null,
    };
    for (const [k, v] of Object.entries(keys)) {
      if (!v) continue;
      if (seen[k].has(v)) results[i].errors.push(`duplicate ${k} (same as ${seen[k].get(v)})`);
      else seen[k].set(v, s.id);
    }
  });
  return {
    results,
    valid: scripts.filter((_, i) => results[i].errors.length === 0),
    errorCount: results.reduce((n, r) => n + r.errors.length, 0),
  };
}

/**
 * Duplicate check against the last `duplicateWindow` posts (and the IG account's recent
 * captions when given). Returns error strings.
 */
export function checkAgainstLog(script, logEntries, policy, recentCaptions = []) {
  const s = resolveScript(script);
  const windowSize = policy.limits.duplicateWindow;
  const recent = (logEntries || []).slice(-windowSize);
  const errors = [];
  const hook = normalizeForCompare(s.hook.lines.join(" "));
  const hash = captionHash(buildCaption(s));
  if ((logEntries || []).some((e) => e.scriptId === s.id)) errors.push(`script ${s.id} was already posted`);
  for (const e of recent) {
    if (e.captionHash && e.captionHash === hash) errors.push(`caption matches post ${e.scriptId} (${e.date})`);
    if (e.hook && normalizeForCompare(e.hook) === hook) errors.push(`hook matches post ${e.scriptId} (${e.date})`);
  }
  for (const c of recentCaptions.slice(0, windowSize)) {
    if (c && captionHash(c) === hash) errors.push("caption matches a recent post on the Instagram account");
  }
  return errors;
}

export function relFromRepo(abs) {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}
