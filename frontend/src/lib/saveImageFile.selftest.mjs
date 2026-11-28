import assert from "node:assert/strict";
import { preferShareSheet, saveImageFile } from "./saveImageFile.js";

const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36";

function fakeDoc() {
  const clicks = [];
  return {
    clicks,
    body: { appendChild() {} },
    createElement() {
      const a = { click() { clicks.push({ href: a.href, download: a.download }); }, remove() {} };
      return a;
    },
  };
}
const win = { setTimeout: () => 0 };

// iOS app (Capacitor): share sheet with the PNG file
{
  const shared = [];
  const nav = { userAgent: IOS_UA, share: async (d) => shared.push(d), canShare: () => true };
  const doc = fakeDoc();
  assert.equal(preferShareSheet({ nav, win: { Capacitor: { isNativePlatform: () => true } } }), true);
  const r = await saveImageFile(blob, "qr.png", { title: "QR", nav, win: { ...win, Capacitor: { isNativePlatform: () => true } }, doc });
  assert.equal(r, "shared");
  assert.equal(shared[0].files[0].name, "qr.png");
  assert.equal(shared[0].files[0].type, "image/png");
  assert.equal(doc.clicks.length, 0, "no dead <a download> in the app");
}
// user closes the sheet: no download behind it
{
  const nav = { userAgent: IOS_UA, share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }, canShare: () => true };
  const doc = fakeDoc();
  assert.equal(await saveImageFile(blob, "qr.png", { nav, win, doc }), "cancelled");
  assert.equal(doc.clicks.length, 0);
}
// phone browser that cannot share files: download
{
  const nav = { userAgent: IOS_UA, share: async () => {}, canShare: () => false };
  const doc = fakeDoc();
  assert.equal(await saveImageFile(blob, "qr.png", { nav, win, doc }), "downloaded");
  assert.equal(doc.clicks[0].download, "qr.png");
}
// desktop (even with navigator.share): a normal download
{
  const nav = { userAgent: WIN_UA, share: async () => { throw new Error("should not share"); }, canShare: () => true, maxTouchPoints: 0 };
  assert.equal(preferShareSheet({ nav, win }), false);
  const doc = fakeDoc();
  assert.equal(await saveImageFile(blob, "qr.png", { nav, win, doc }), "downloaded");
}
// share fails for another reason: falls back to a download
{
  const nav = { userAgent: IOS_UA, share: async () => { throw new TypeError("boom"); }, canShare: () => true };
  const doc = fakeDoc();
  assert.equal(await saveImageFile(blob, "qr.png", { nav, win, doc }), "downloaded");
}
await assert.rejects(saveImageFile(null, "x.png", { nav: {}, win, doc: fakeDoc() }));
console.log("saveImageFile selftest ok");
