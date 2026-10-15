// node src/api/transportRetry.selftest.mjs
import { isTransportError, isTransientHttpStatus, transientFailureError, withReadRetry } from "./transportRetry.js";

function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
}

const loadFailed = () => new TypeError("Load failed (des-call.onrender.com)");
function scripted(steps) {
  const fn = async () => {
    fn.calls += 1;
    const next = steps.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = 0;
  return fn;
}
async function rejection(promise) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  return null;
}

assert(isTransportError(loadFailed()) && isTransportError(new TypeError("Failed to fetch")), "TypeError is transport");
assert(!isTransportError(Object.assign(new Error("Request failed (500)"), { status: 500 })), "HTTP error is not transport");
assert(isTransientHttpStatus(502) && isTransientHttpStatus(503) && isTransientHttpStatus(504), "gateway status");
assert(!isTransientHttpStatus(404) && !isTransientHttpStatus(401), "client errors are not retried as gateway");

let send = scripted([loadFailed(), loadFailed(), "third"]);
assert((await withReadRetry(send, { delayMs: 0 })) === "third" && send.calls === 3, "GET keeps retrying a Load failed");

send = scripted(Array.from({ length: 8 }, loadFailed));
let err = await rejection(withReadRetry(send, { delayMs: 0, budgetMs: 15000 }));
assert(err?.name === "TypeError" && send.calls === 6, "GET stops after six tries");

send = scripted([loadFailed(), "never"]);
err = await rejection(withReadRetry(send, { method: "POST", delayMs: 0 }));
assert(err?.name === "TypeError" && send.calls === 1, "POST (purchase / claim) is never repeated");

send = scripted([new Error("HTTP 500"), "never"]);
err = await rejection(withReadRetry(send, { delayMs: 0 }));
assert(err?.message === "HTTP 500" && send.calls === 1, "non-transport errors are not retried");

send = scripted([{ status: 503 }, { status: 200, ok: true }]);
const recovered = await withReadRetry(send, { delayMs: 0 });
assert(recovered.status === 200 && send.calls === 2, "GET retries a 503");

const aborted = new AbortController();
aborted.abort();
send = scripted([loadFailed(), "never"]);
err = await rejection(withReadRetry(send, { signal: aborted.signal, delayMs: 0 }));
assert(err && send.calls === 1, "aborted requests are not retried");

const calm = transientFailureError(503);
assert(calm.code === "transient" && !/load failed|unreachable|onrender/i.test(calm.message), "callers never see the raw WebKit string");

console.log("transportRetry.selftest.mjs ok");
