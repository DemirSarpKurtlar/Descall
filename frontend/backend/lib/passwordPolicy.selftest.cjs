"use strict";

const { checkNewPassword, isPwnedPassword } = require("./passwordPolicy");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const short = await checkNewPassword("short", { env: { PASSWORD_HIBP: "0" } });
  assert(short.code === "weak_password", "short password rejected");
  assert(/10/.test(short.error), "message names the minimum");

  const ok = await checkNewPassword("a-reasonably-long-secret", { env: { PASSWORD_HIBP: "0" } });
  assert(!ok.error, "hibp disabled accepts a long password");

  const down = await isPwnedPassword("anything", async () => {
    throw new Error("offline");
  });
  assert(down === false, "hibp outage fails open");

  // SHA1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const hit = await isPwnedPassword("password", async () => ({
    ok: true,
    text: async () => "0018A45C4D1DEF81644B54AB7F969B88D65:1\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9\n",
  }));
  assert(hit === true, "range suffix match is pwned");

  const miss = await isPwnedPassword("password", async () => ({
    ok: true,
    text: async () => "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1\n",
  }));
  assert(miss === false, "different suffix is not pwned");

  console.log("passwordPolicy.selftest.cjs: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
