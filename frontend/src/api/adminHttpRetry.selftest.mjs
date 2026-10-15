import { isRetryableAdminError, isTransientAdminStatus } from "./adminHttpRetry.js";

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

assert(isTransientAdminStatus(502) && isTransientAdminStatus(503) && isTransientAdminStatus(504), "gateway codes");
assert(!isTransientAdminStatus(404) && !isTransientAdminStatus(401), "auth/not found are not transient");
assert(isRetryableAdminError({ status: 502, message: "HTTP 502" }), "retry 502");
assert(isRetryableAdminError({ message: "Admin API unreachable. Check connection and try again." }), "retry unreachable");
assert(isRetryableAdminError({ code: "transient", message: "Bağlantı gecikti. Kayıtlı veriler duruyor, yeniden deniyoruz." }), "retry calm transient");
assert(!/Admin API unreachable|deploy sonrası/.test("Bağlantı gecikti. Yeniden deniyoruz."), "the quiet notice is not the old banner copy");
assert(!isRetryableAdminError({ status: 404, message: "Not found" }), "do not retry 404");
assert(!isRetryableAdminError({ status: 400, message: "word required." }), "do not retry 400");

console.log("adminHttpRetry.selftest.mjs ok");
