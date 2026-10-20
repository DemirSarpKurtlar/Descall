// Admin tab order: Bakım (maintenance) is the 2nd tab, right after Genel Bakış (overview), on every platform (one shared TABS list).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "AdminPanel.jsx"), "utf8");
const block = src.match(/const TABS = \[([\s\S]*?)\n\];/);
if (!block) throw new Error("TABS list not found");
const ids = [...block[1].matchAll(/id: "([^"]+)"/g)].map((m) => m[1]);
if (ids[0] !== "overview") throw new Error(`Genel Bakış must be the first admin tab, got: ${ids.join(", ")}`);
if (ids[1] !== "maintenance") throw new Error(`Bakım must be the 2nd admin tab (after Genel Bakış), got: ${ids.join(", ")}`);
if (ids.indexOf("maintenance") !== ids.lastIndexOf("maintenance")) throw new Error("Bakım listed twice");
if (new Set(ids).size !== ids.length) throw new Error("duplicate admin tab id");
console.log(`adminTabOrder ok (${ids.length} tabs, Bakım 2nd)`);
