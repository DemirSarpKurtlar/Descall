#!/usr/bin/env node
/**
 * Workflow gate: decides skip / dry-run / publish before anything is installed.
 * Reads secrets only to check that they are present; never prints them.
 *   EVENT=<github.event_name> DRY_RUN_INPUT=<inputs.dry_run> node bin/gate.mjs
 */
import { appendFileSync } from "node:fs";
import { decideMode } from "../lib/daily.mjs";
import { readPostedLog } from "../lib/library.mjs";

const { mode, reason } = decideMode({
  env: process.env,
  event: process.env.EVENT || "workflow_dispatch",
  dryRunInput: process.env.DRY_RUN_INPUT,
  posts: readPostedLog(),
});
console.log(`gate: ${mode} (${reason})`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\nreason=${reason}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Instagram Reels gate: **${mode}** (${reason})\n`);
