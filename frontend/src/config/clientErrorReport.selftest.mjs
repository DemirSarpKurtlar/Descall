/**
 * Client error reports must hit Render, not the Vercel SPA origin.
 * descall.com/api/* is a static file. POST there is 405.
 * Run: node frontend/src/config/clientErrorReport.selftest.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientErrorReportUrl } from "./api.js";

const RENDER = "https://des-call.onrender.com/api/errors";
const here = dirname(fileURLToPath(import.meta.url));

assert.equal(clientErrorReportUrl({ hostname: "descall.com" }), RENDER);
assert.equal(clientErrorReportUrl({ hostname: "www.descall.com" }), RENDER);
assert.equal(clientErrorReportUrl({ hostname: "descall-preview.vercel.app" }), RENDER);
assert.equal(clientErrorReportUrl({ electron: true, hostname: "descall.com" }), RENDER);
assert.equal(
  clientErrorReportUrl({ hostname: "localhost" }),
  "http://localhost:3000/api/errors"
);
assert.equal(
  clientErrorReportUrl({
    hostname: "descall.com",
    meta: { VITE_API_BASE_URL: "https://des-call.onrender.com" },
  }),
  RENDER
);
assert.equal(
  clientErrorReportUrl({
    hostname: "descall.com",
    meta: { VITE_API_URL: "https://descall.com" },
  }),
  RENDER,
  "VITE_API_URL is not the API base and must not retarget error reports at the SPA"
);

for (const rel of ["../components/ErrorBoundary.jsx", "../utils/errorHandler.js"]) {
  const src = readFileSync(join(here, rel), "utf8");
  assert.match(src, /clientErrorReportUrl\(/);
  assert.equal(src.includes("VITE_API_URL"), false, rel);
  assert.equal(src.includes("window.location.origin"), false, rel);
}

console.log("clientErrorReport.selftest ok");
