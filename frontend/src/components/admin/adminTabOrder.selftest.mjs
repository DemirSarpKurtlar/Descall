// Admin tab order: Bakım (maintenance) is the last tab on every platform (one shared TABS list).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AdminPanel.jsx"), "utf8");
const block = src.match(/const TABS = \[([\s\S]*?)\n\];/);
if (!block) throw new Error("TABS list not found");
const ids = [...block[1].matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
if (ids[ids.length - 1] !== "maintenance") throw new Error(`Bakım must be the last admin tab, got: ${ids.join(", ")}`);
if (new Set(ids).size !== ids.length) throw new Error("duplicate admin tab id");
console.log(`adminTabOrder ok (${ids.length} tabs, Bakım last)`);
