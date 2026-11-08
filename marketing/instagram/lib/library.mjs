/**
 * Content library (content/*.json, each file an array of scripts) and the posted log.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR, ISTANBUL_TZ, POSTED_LOG_PATH } from "./config.mjs";

export function loadLibrary(dir = CONTENT_DIR) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const scripts = [];
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const list = Array.isArray(data) ? data : data.scripts;
    if (!Array.isArray(list)) throw new Error(`${f}: expected an array of scripts`);
    for (const s of list) {
      Object.defineProperty(s, "__file", { value: f, enumerable: false });
      scripts.push(s);
    }
  }
  return scripts;
}

export function readPostedLog(path = POSTED_LOG_PATH) {
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, "utf8"));
  const posts = Array.isArray(data) ? data : data.posts;
  if (!Array.isArray(posts)) throw new Error(`${path}: expected { posts: [] }`);
  return posts;
}

export function writePostedLog(posts, path = POSTED_LOG_PATH) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ posts }, null, 2) + "\n");
  renameSync(tmp, path);
}

/** YYYY-MM-DD in Istanbul for a Date. */
export function istanbulDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ISTANBUL_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Hour (0-23) in Istanbul. */
export function istanbulHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: ISTANBUL_TZ, hour: "2-digit", hourCycle: "h23" }).format(date));
}

export function postedOn(posts, day) {
  return posts.some((p) => p.date === day);
}
