module.exports = {
  async call(page) {
    await module.exports.openDm(page);
    // Tap the video-call button in the DM header.
    const clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => /sesli arama|voice call/i.test((x.title || "") + " " + (x.getAttribute("aria-label") || "")));
      if (b) { b.click(); return b.title || b.getAttribute("aria-label"); }
      return null;
    });
    console.log("clicked", clicked);
    await new Promise((r) => setTimeout(r, 3500));
  },
};
module.exports.openDm = async function (page) {
  const ok = await page.evaluate(() => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.textContent.trim() === "Ayşe");
    const el = els[0];
    if (!el) return false;
    (el.closest("button, [role=button], li, a, .conversation-item, div[class*=item]") || el).click();
    return true;
  });
  console.log("openDm", ok);
  await new Promise((r) => setTimeout(r, 2500));
};
module.exports.openServer = async function (page) {
  const info = await page.evaluate(() => document.body.innerText.slice(0, 500));
  console.log("server text:", info.replace(/\n/g, " | "));
};
module.exports.clickText = async function (page, text) {
  const ok = await page.evaluate((text) => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.textContent.trim() === text);
    const el = els[els.length - 1];
    if (!el) return false;
    (el.closest("button, [role=button], a, li") || el).click();
    return true;
  }, text);
  await new Promise((r) => setTimeout(r, 2500));
  return ok;
};
module.exports.openServer = async function (page) { console.log("genel", await module.exports.clickText(page, "genel")); };
module.exports.voiceChannel = async function (page) {
  console.log("Lobi", await module.exports.clickText(page, "Lobi"));
  if (process.env.JOIN !== "0") {
    await new Promise((r) => setTimeout(r, 1500));
    const ok = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /Sese Katıl|Join Voice/i.test(x.textContent));
      if (b) { b.click(); return true; } return false;
    });
    console.log("join", ok);
  }
  await new Promise((r) => setTimeout(r, 3000));
};
