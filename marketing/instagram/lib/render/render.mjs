/**
 * Renders a script to an MP4 (H.264 + AAC, 1080x1920, 30 fps, faststart) and a JPEG cover.
 * Frames: headless Chromium via Playwright, captured as JPEG over CDP and piped into ffmpeg.
 * Audio: the procedural bed from lib/audio.mjs.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SPEC } from "../config.mjs";
import { writeAudioBed } from "../audio.mjs";
import { ffmpegPath } from "../mp4.mjs";
import { buildHtml } from "./template.mjs";

const require = createRequire(import.meta.url);

/** Playwright from the pipeline's node_modules, else a global install (NODE_PATH). */
export function loadPlaywright() {
  return require("playwright");
}

function runFfmpeg(args, { onStdin } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { stdio: ["pipe", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-1500)}`))));
    if (onStdin) onStdin(p.stdin).catch((e) => { p.kill("SIGKILL"); reject(e); });
    else p.stdin.end();
  });
}

function write(stream, buf) {
  return new Promise((resolve, reject) => {
    if (stream.write(buf)) resolve();
    else {
      stream.once("drain", resolve);
      stream.once("error", reject);
    }
  });
}

/**
 * @param {object} script  a valid script
 * @param {object} o
 * @param {string} o.outDir
 * @param {object} [o.screenshots]  allowlist
 * @param {number} [o.fps]
 * @param {number} [o.crf]
 * @param {Function} [o.log]
 * @returns {Promise<{ video: string, cover: string, total: number, frames: number }>}
 */
export async function renderReel(script, { outDir, screenshots = {}, fps = SPEC.fps, crf = 21, log = () => {} }) {
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "descall-reel-"));
  const video = join(outDir, `${script.id}.mp4`);
  const cover = join(outDir, `${script.id}-cover.jpg`);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--disable-lcd-text", "--force-color-profile=srgb"] });
  try {
    const context = await browser.newContext({ viewport: { width: SPEC.width, height: SPEC.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    // Cover.
    const coverPage = buildHtml(script, { screenshots, mode: "cover" });
    const coverHtml = join(work, "cover.html");
    writeFileSync(coverHtml, coverPage.html);
    await page.goto(pathToFileURL(coverHtml).href, { waitUntil: "load" });
    await page.evaluate(() => window.__ready);
    await page.screenshot({ path: cover, type: "jpeg", quality: 90 });

    // Video frames.
    const { html, total } = buildHtml(script, { screenshots, mode: "video" });
    const htmlPath = join(work, "reel.html");
    writeFileSync(htmlPath, html);
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    const ready = await page.evaluate(() => window.__ready);
    if (!ready.fonts) throw new Error("brand fonts did not load");
    const wav = writeAudioBed(join(work, "bed.wav"), total, { kind: script.audio || "pad", seed: script.id });
    const frames = Math.round(total * fps);
    const cdp = await context.newCDPSession(page);
    log(`render ${script.id}: ${total}s, ${frames} frames`);

    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "pipe:0",
      "-i", wav,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "medium", "-profile:v", "high", "-level:v", "4.1",
      "-pix_fmt", SPEC.pixFmt, "-crf", String(crf), "-maxrate", "8M", "-bufsize", "16M",
      "-r", String(fps), "-g", String(fps * 2), "-keyint_min", String(fps), "-sc_threshold", "0", "-flags", "+cgop",
      "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
      "-c:a", "aac", "-b:a", "128k", "-ar", String(SPEC.audioRate), "-ac", String(SPEC.audioChannels),
      "-t", total.toFixed(3),
      "-movflags", "+faststart",
      video,
    ];
    await runFfmpeg(args, {
      onStdin: async (stdin) => {
        for (let i = 0; i < frames; i++) {
          const t = i / fps;
          await page.evaluate((x) => window.__setTime(x), t);
          const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
          await write(stdin, Buffer.from(data, "base64"));
          if (i % (fps * 5) === 0) log(`  frame ${i}/${frames}`);
        }
        stdin.end();
      },
    });
    return { video, cover, total, frames };
  } finally {
    await browser.close().catch(() => {});
    rmSync(work, { recursive: true, force: true });
  }
}
