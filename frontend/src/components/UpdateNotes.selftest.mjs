/**
 * Run: node frontend/src/components/UpdateNotes.selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const notes = readFileSync(join(root, "UpdateNotes.jsx"), "utf8");
const modal = readFileSync(join(root, "ui/Modal.jsx"), "utf8");
const css = readFileSync(join(root, "../styles/ui-polish.css"), "utf8");
const en = readFileSync(join(root, "../i18n/locales/en.js"), "utf8");
const tr = readFileSync(join(root, "../i18n/locales/tr.js"), "utf8");

function assert(c, m) { if (!c) throw new Error(m); }

assert(notes.includes('import Modal from "./ui/Modal"'), "UpdateNotes uses shared Modal");
assert(notes.includes('className="update-notes-dialog"'), "UpdateNotes marks dialog for mobile layout");
assert(notes.includes("update-notes-list") && notes.includes("update-notes-done"), "list + dismiss button present");
assert(notes.includes('version: "2.9.47"'), "notes include 2.9.46 entry");
assert(modal.includes("className"), "Modal accepts className");
assert(modal.includes("modal-backdrop") && modal.includes("modal-card"), "Modal class hooks");

assert(css.includes(".modal-backdrop"), "modal backdrop styles exist");
assert(css.includes("env(safe-area-inset-top"), "modal uses top safe-area");
assert(css.includes("env(safe-area-inset-bottom"), "modal uses bottom safe-area");
assert(css.includes("update-notes-dialog"), "mobile dialog target");
assert(css.includes(".update-notes-list") && css.includes("overflow: auto"), "notes list scrolls");
assert(css.includes(".update-notes-actions") && css.includes("flex-shrink: 0"), "Tamam/actions pinned");
assert(css.includes(".update-notes-done") && css.includes("width: 100%"), "mobile Tamam full-width");
assert(/@media \(max-width: 768px\)/.test(css) && css.includes("align-items: flex-end"), "mobile modal anchors with safe area");

assert(en.includes("v2947") && tr.includes("v2947"), "EN+TR copy for 2.9.47");
assert(tr.includes('"gotIt": "Tamam"'), "TR dismiss is Tamam");

console.log("UpdateNotes.selftest.mjs: ok");
