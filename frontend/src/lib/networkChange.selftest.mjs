import { networkChangeReason } from "./networkChange.js";

const cases = [
  [null, { online: true, type: "wifi" }, null],
  [{ online: false, type: "" }, { online: true, type: "wifi" }, "online"],
  [{ online: true, type: "wifi" }, { online: false, type: "wifi" }, "offline"],
  [{ online: true, type: "wifi" }, { online: true, type: "cellular" }, "type"],
  [{ online: true, type: "wifi" }, { online: true, type: "wifi" }, null],
  [{ online: true, type: "" }, { online: true, type: "wifi" }, null],
  [{ online: true, type: "wifi" }, { online: true, type: "" }, null],
];

let failed = 0;
for (const [prev, next, expected] of cases) {
  const got = networkChangeReason(prev, next);
  if (got !== expected) {
    failed += 1;
    console.error("FAIL", { prev, next, expected, got });
  }
}
if (failed) {
  console.error(`networkChange.selftest: ${failed} failed`);
  process.exit(1);
}
console.log("networkChange.selftest: ok");
