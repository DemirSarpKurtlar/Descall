// node src/api/transportRetry.selftest.mjs — one retry after a transport failure, reads only.
import { isTransportError, withReadRetry } from "./transportRetry.js";

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

let send = scripted([loadFailed(), "second"]);
assert((await withReadRetry(send, { delayMs: 0 })) === "second" && send.calls === 2, "GET retried once after Load failed");

send = scripted([loadFailed(), loadFailed()]);
let err = await rejection(withReadRetry(send, { delayMs: 0 }));
assert(err?.name === "TypeError" && send.calls === 2, "GET gives up after one retry");

send = scripted([loadFailed(), "never"]);
err = await rejection(withReadRetry(send, { method: "POST", delayMs: 0 }));
assert(err?.name === "TypeError" && send.calls === 1, "POST (purchase / claim) is never repeated");

send = scripted([new Error("HTTP 500"), "never"]);
err = await rejection(withReadRetry(send, { delayMs: 0 }));
assert(err?.message === "HTTP 500" && send.calls === 1, "non-transport errors are not retried");

const aborted = new AbortController();
aborted.abort();
send = scripted([loadFailed(), "never"]);
err = await rejection(withReadRetry(send, { signal: aborted.signal, delayMs: 0 }));
assert(err && send.calls === 1, "aborted requests are not retried");

console.log("transportRetry.selftest.mjs ok");
