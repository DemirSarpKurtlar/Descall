// download-file name sanitizing. Run from frontend/: node electron/safeDownload.selftest.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { sanitizeDownloadFilename: clean, resolveDownloadPath, isDownloadableUrl, MAX_NAME_LENGTH } = require("./safeDownload.cjs");

// Ordinary names are untouched.
assert.equal(clean("Descall-Setup-3.7.26.exe"), "Descall-Setup-3.7.26.exe");
assert.equal(clean("photo 1.png"), "photo 1.png");
assert.equal(clean("rapor (son).pdf"), "rapor (son).pdf");
assert.equal(clean("Şükrü çiçek.txt"), "Şükrü çiçek.txt");

// Basename only, for either separator.
assert.equal(clean("..\\..\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\x.bat"), "x.bat");
assert.equal(clean("../../../etc/cron.d/evil"), "evil");
assert.equal(clean("C:\\Windows\\System32\\drivers\\etc\\hosts"), "hosts");
assert.equal(clean("/abs/path/file.zip"), "file.zip");
assert.equal(clean("dir/"), "download");

// Reserved characters, controls, bidi tricks.
assert.equal(clean('a<b>c:d"e|f?g*h.txt'), "a_b_c_d_e_f_g_h.txt");
assert.equal(clean("tab\there\nnew\u0000nul.txt"), "tab_here_new_nul.txt");
assert.equal(clean("invoice\u202Etxt.exe"), "invoicetxt.exe", "RLO override removed");
assert.equal(clean("a\u200Bb.txt"), "ab.txt");

// Dots and spaces.
assert.equal(clean(".."), "download");
assert.equal(clean("."), "download");
assert.equal(clean("...hidden"), "hidden");
assert.equal(clean("name.exe. . "), "name.exe");
assert.equal(clean("   "), "download");
assert.equal(clean(""), "download");
assert.equal(clean(null), "download");
assert.equal(clean(undefined), "download");
assert.equal(clean(42), "42");

// Windows device names, any case, with or without an extension.
for (const n of ["CON", "con", "PRN.txt", "aux.tar.gz", "NUL", "COM1", "com9.log", "LPT1", "lpt3.txt", "COM¹"]) {
  assert.ok(clean(n).startsWith("_"), `${n} is prefixed`);
}
assert.equal(clean("console.log"), "console.log", "only exact device names");
assert.equal(clean("COM10"), "COM10");

// Length cap keeps a short extension.
const long = clean("a".repeat(400) + ".exe");
assert.equal(long.length, MAX_NAME_LENGTH);
assert.ok(long.endsWith(".exe"));
const longNoExt = clean("b".repeat(400));
assert.equal(longNoExt.length, MAX_NAME_LENGTH);
const longExt = clean("c." + "d".repeat(400));
assert.ok(longExt.length <= MAX_NAME_LENGTH);

// Destination is always a direct child of the downloads folder.
for (const dir of [path.resolve("/tmp/descall-dl"), path.resolve("/tmp/descall-dl/")]) {
  for (const n of [
    "..\\..\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\x.bat",
    "../../x.sh", "..", ".", "", "/etc/passwd", "a/../../b", "CON", "x".repeat(1000), "%2e%2e%2fx",
  ]) {
    const { filePath, name } = resolveDownloadPath(dir, n);
    assert.equal(path.dirname(filePath), path.resolve(dir), `${n} lands in Downloads`);
    assert.equal(path.basename(filePath), name);
    assert.ok(!name.includes("/") && !name.includes("\\"));
  }
}
assert.equal(resolveDownloadPath("/tmp/descall-dl", "Descall-Setup-3.7.26.exe").filePath, path.resolve("/tmp/descall-dl/Descall-Setup-3.7.26.exe"));

// Only http(s) is fetched.
assert.equal(isDownloadableUrl("https://github.com/x/releases/download/v1/Descall-Setup-1.0.0.exe"), true);
assert.equal(isDownloadableUrl("http://example.com/a.zip"), true);
for (const u of ["file:///C:/Windows/win.ini", "descall://app/index.html", "javascript:alert(1)", "data:text/plain,x", "https://user:pw@example.com/a", "", null, "not a url"]) {
  assert.equal(isDownloadableUrl(u), false, `${u} refused`);
}

// Wiring: main.cjs uses it and no longer joins the raw name.
const main = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
assert.match(main, /require\('\.\/safeDownload\.cjs'\)/);
const handler = main.slice(main.indexOf("trustedOn('download-file'"), main.indexOf("// Register custom protocol for sounds"));
assert.match(handler, /isDownloadableUrl\(url\)/);
assert.match(handler, /resolveDownloadPath\(app\.getPath\('downloads'\), filename\)/);
assert.doesNotMatch(handler, /path\.join\(downloadsPath, filename\)/);
assert.match(handler, /versionFromSetupFilename\(name\)/, "setup pruning reads the sanitized name");

console.log("safeDownload.selftest: ok");
