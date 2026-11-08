/**
 * The daily run: gate -> pick -> render -> check -> (dry run stops here) -> upload ->
 * container -> poll -> publish -> posted log. Dependencies are injected so the whole
 * flow is testable without Chromium, ffmpeg, Supabase or Instagram.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCaption, captionHash } from "./caption.mjs";
import { GraphClient } from "./graph.mjs";
import { istanbulDate, istanbulHour, postedOn } from "./library.mjs";
import { pickNext } from "./picker.mjs";
import { resolveScript } from "./script.mjs";
import { storageFromEnv, verifyPublicUrl } from "./storage.mjs";
import { validateLibrary, validateScript } from "./validator.mjs";

export const SCHEDULE_WINDOW_HOURS = Object.freeze({ from: 17, to: 22 }); // Istanbul, inclusive

const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

/**
 * Decide what this run does, before any dependency is installed.
 * @returns {{ mode: "skip"|"dry-run"|"publish", reason: string }}
 */
export function decideMode({ env = process.env, event = "workflow_dispatch", dryRunInput, posts = [], now = new Date() }) {
  const dryRun = event === "workflow_dispatch" ? String(dryRunInput ?? "true") !== "false" : false;
  if (dryRun) return { mode: "dry-run", reason: "dry run requested" };
  if (env.IG_AUTOPOST_ENABLED !== "true") return { mode: "skip", reason: "kill switch: repository variable IG_AUTOPOST_ENABLED is not 'true'" };
  if (!nonEmpty(env.IG_USER_ID) || !nonEmpty(env.IG_ACCESS_TOKEN)) return { mode: "skip", reason: "secrets IG_USER_ID / IG_ACCESS_TOKEN are not set" };
  const hasSupabase = nonEmpty(env.SUPABASE_URL) && nonEmpty(env.SUPABASE_SERVICE_ROLE_KEY);
  const hasFallback = env.IG_MEDIA_FALLBACK === "github-release" && nonEmpty(env.GITHUB_TOKEN);
  if (!hasSupabase && !hasFallback) return { mode: "skip", reason: "no public storage: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or IG_MEDIA_FALLBACK=github-release)" };
  const today = istanbulDate(now);
  if (postedOn(posts, today)) return { mode: "skip", reason: `already posted today (${today}, Istanbul)` };
  if (event === "schedule") {
    const h = istanbulHour(now);
    if (h < SCHEDULE_WINDOW_HOURS.from || h > SCHEDULE_WINDOW_HOURS.to) return { mode: "skip", reason: `scheduled run started at ${h}:xx Istanbul, outside the ${SCHEDULE_WINDOW_HOURS.from}:00-${SCHEDULE_WINDOW_HOURS.to}:59 window` };
  }
  return { mode: "publish", reason: "enabled" };
}

/**
 * @param {object} o
 * @param {"dry-run"|"publish"} o.mode
 * @param {string} [o.scriptId]
 * @param {string} o.outDir
 * @param {object} o.policy
 * @param {object[]} o.scripts
 * @param {object[]} o.posts
 * @param {object} o.screenshots
 * @param {object} [o.env]
 * @param {Date} [o.now]
 * @param {object} deps { render(script, outDir) -> {video, cover, total}, checkVideo(file) -> {ok, errors, info},
 *                        graph?, storage?, writeLog(posts), log, readFile? }
 * @returns {Promise<object>} result written to outDir/result.json
 */
export async function runDaily(o, deps) {
  const { mode, scriptId, outDir, policy, scripts, posts, screenshots, env = process.env, now = new Date() } = o;
  const log = deps.log || (() => {});
  mkdirSync(outDir, { recursive: true });
  const result = { mode, status: "skipped", reason: "", scriptId: null, date: istanbulDate(now) };
  const finish = (extra) => {
    Object.assign(result, extra);
    writeFileSync(join(outDir, "result.json"), JSON.stringify(result, null, 2) + "\n");
    return result;
  };

  if (mode === "publish" && env.IG_AUTOPOST_ENABLED !== "true") return finish({ reason: "kill switch: IG_AUTOPOST_ENABLED is not 'true'" });

  const { valid, results } = validateLibrary(scripts, { policy, screenshots });
  const invalid = results.filter((r) => r.errors.length);
  if (invalid.length) log(`warning: ${invalid.length} invalid script(s) are excluded: ${invalid.map((r) => r.id).join(", ")}`);
  if (scriptId && !valid.some((s) => s.id === scriptId)) {
    const r = results.find((x) => x.id === scriptId);
    return finish({ status: "failed", reason: r ? `script ${scriptId} is invalid: ${r.errors.join("; ")}` : `unknown script ${scriptId}` });
  }

  let graph = null;
  let recentCaptions = [];
  if (mode === "publish") {
    graph = deps.graph || new GraphClient({ igUserId: env.IG_USER_ID, accessToken: env.IG_ACCESS_TOKEN, version: env.IG_GRAPH_VERSION || undefined, log });
    const account = await graph.getAccount();
    log(`instagram account ok (${account.username ? "@" + account.username : account.id})`);
    const limit = await graph.getPublishingLimit();
    const reserve = Number(env.IG_LIMIT_RESERVE || 5);
    log(`publishing limit: ${limit.used}/${limit.total ?? "?"} used in the last 24 h`);
    if (limit.total != null && limit.remaining <= reserve) return finish({ reason: `near the publishing limit (${limit.used}/${limit.total}, reserve ${reserve})` });
    recentCaptions = (await graph.recentMedia(policy.limits.duplicateWindow)).map((m) => m.caption).filter(Boolean);
  }

  const pick = pickNext({ scripts: valid, posts, policy, forcedId: scriptId || undefined, now, allowSameDay: mode !== "publish", recentCaptions });
  if (!pick.script) return finish({ status: /exhausted/.test(pick.reason) ? "exhausted" : "skipped", reason: pick.reason });
  const script = resolveScript(pick.script);
  log(`picked ${script.id} (${script.theme}): ${pick.reason}`);

  // Re-check the picked script on its own right before rendering (belt and braces).
  const errs = validateScript(script, { policy, screenshots });
  if (errs.length) return finish({ status: "failed", scriptId: script.id, reason: `validation: ${errs.join("; ")}` });

  const caption = buildCaption(script);
  writeFileSync(join(outDir, "caption.txt"), caption + "\n");
  const rendered = await deps.render(script, outDir);
  const check = deps.checkVideo(rendered.video);
  if (!check.ok) return finish({ status: "failed", scriptId: script.id, reason: `video spec: ${check.errors.join("; ")}`, video: check.info });
  const base = { scriptId: script.id, theme: script.theme, videoFile: rendered.video, coverFile: rendered.cover, video: check.info, caption };
  writeFileSync(join(outDir, "plan.json"), JSON.stringify({ ...base, pickReason: pick.reason }, null, 2) + "\n");
  if (mode !== "publish") return finish({ ...base, status: "rendered", reason: "dry run: nothing was posted" });

  // Publish.
  const storage = deps.storage || storageFromEnv(env);
  if (!storage) return finish({ ...base, status: "skipped", reason: "no public storage configured" });
  if (storage.kind === "supabase" && storage.store.ensureBucket) await storage.store.ensureBucket();
  const stem = `reels/${result.date}-${script.id}`;
  const readBytes = deps.readFile || ((p) => readFileSync(p));
  const videoUrl = await storage.store.upload(`${stem}.mp4`, readBytes(rendered.video), "video/mp4");
  const coverUrl = await storage.store.upload(`${stem}.jpg`, readBytes(rendered.cover), "image/jpeg");
  await (deps.verifyUrl || verifyPublicUrl)(videoUrl, "video/mp4");
  await (deps.verifyUrl || verifyPublicUrl)(coverUrl, "image/jpeg");
  log(`uploaded to ${storage.kind}`);

  const published = await graph.publishReel({ videoUrl, caption, coverUrl, pollIntervalMs: deps.pollIntervalMs, pollTimeoutMs: deps.pollTimeoutMs });
  const entry = {
    scriptId: script.id,
    theme: script.theme,
    date: result.date,
    postedAt: now.toISOString(),
    mediaId: published.mediaId,
    containerId: published.containerId,
    permalink: published.permalink,
    captionHash: captionHash(caption),
    hook: script.hook.lines.join(" ").replace(/\*/g, ""),
    videoUrl,
  };
  deps.writeLog([...posts, entry]);
  log(`published ${script.id}: ${published.permalink || published.mediaId}`);
  return finish({ ...base, status: "published", reason: "posted", entry });
}
