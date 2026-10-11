import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto("file:///workspace/glass-redesign/desktop/src/screens/zz-pub-server.html", { waitUntil: "networkidle" });
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/pub-server.png" });
await b.close();
