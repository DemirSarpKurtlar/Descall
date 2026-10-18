// node infra/cloudflare/apply-edge.selftest.mjs
import assert from "node:assert/strict";
import { desiredCacheRules, mergeRules, ruleExpression } from "./apply-edge.mjs";

const rules = desiredCacheRules();
assert.equal(rules.length, 2);
assert.match(rules[0].expression, /^\(http\.host eq "api\.descall\.com" and \(/);
assert.ok(rules[0].expression.includes('starts_with(http.request.uri.path, "/api/shop/assets/")'));
assert.deepEqual(rules[0].action_parameters.edge_ttl, { mode: "respect_origin" });
assert.deepEqual(rules[1].action_parameters, { cache: false });
assert.ok(rules[1].expression.includes('"/socket.io"'));
const merged = mergeRules([{ description: "someone else", expression: "true", action: "set_cache_settings", action_parameters: { cache: false }, id: "x" }, { description: "descall-edge: old", expression: "true" }], rules);
assert.equal(merged.length, 3);
assert.equal(merged[0].description, "someone else");
assert.equal(merged[0].id, undefined);
assert.throws(() => ruleExpression("h", { description: "x" }));
console.log("apply-edge.selftest.mjs: ok");
