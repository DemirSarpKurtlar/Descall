import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "screens");
const only = process.argv.slice(2);
const batches = ["a", "b", "c", "d", "e"].filter((b) => fs.existsSync(path.join(__dirname, `screens-${b}.mjs`)));
const all = {};
for (const b of batches) Object.assign(all, (await import(`./screens-${b}.mjs?${Date.now()}`)).default);
fs.mkdirSync(outDir, { recursive: true });
for (const [name, html] of Object.entries(all)) {
  if (only.length && !only.includes(name)) continue;
  fs.writeFileSync(path.join(outDir, `${name}.html`), html);
}
console.log("built", Object.keys(all).length, "screens:", Object.keys(all).join(" "));
