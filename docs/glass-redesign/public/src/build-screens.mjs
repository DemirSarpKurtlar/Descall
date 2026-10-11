import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "screens");
const only = process.argv.slice(2);
const all = {};
for (const b of ["a", "b", "c"]) if (fs.existsSync(path.join(__dirname, `screens-${b}.mjs`))) Object.assign(all, (await import(`./screens-${b}.mjs?${Date.now()}`)).default);
fs.mkdirSync(outDir, { recursive: true });
let bad = 0;
for (const [name, html] of Object.entries(all)) {
  if (only.length && !only.includes(name)) continue;
  const txt = html.replace(/<[^>]+>/g, " ");
  if (/valorant|riot\b|dimaai/i.test(txt)) { console.error("BRAND RULE VIOLATION in", name, txt.match(/.{40}(valorant|riot\b|dimaai).{40}/i)?.[0]); bad++; }
  fs.writeFileSync(path.join(outDir, `${name}.html`), html);
}
console.log("built", Object.keys(all).length, "screens");
if (bad) process.exit(1);
