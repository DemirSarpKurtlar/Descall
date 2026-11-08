import assert from "node:assert/strict";
import { parseBlocks, parseInline, parseSse } from "./agentMarkdown.js";

assert.deepEqual(parseInline("a **b** `c` d"), [
  { t: "text", v: "a " }, { t: "bold", v: "b" }, { t: "text", v: " " }, { t: "code", v: "c" }, { t: "text", v: " d" },
]);

const blocks = parseBlocks("### Özet\nBugün **42** kayıt.\n\n- web\n- iOS\n\n1. bir\n2. iki\n\n| Kaynak | Kayıt |\n|---|---|\n| Google | 20 |\n| TikTok | 12 |\n\n```\nx\n```");
assert.deepEqual(blocks.map((b) => b.type), ["h", "p", "ul", "ol", "table", "code"]);
assert.deepEqual(blocks[4].head, ["Kaynak", "Kayıt"]);
assert.deepEqual(blocks[4].rows, [["Google", "20"], ["TikTok", "12"]]);
assert.deepEqual(blocks[2].items, ["web", "iOS"]);

// HTML stays text (rendered by React as text, never as markup).
assert.equal(parseBlocks("<img src=x onerror=alert(1)>")[0].text, "<img src=x onerror=alert(1)>");

const [events, rest] = parseSse('data: {"type":"text","delta":"Mer"}\n\n: ping\n\ndata: {"type":"done"}\n\ndata: {"type":"te');
assert.deepEqual(events, [{ type: "text", delta: "Mer" }, { type: "done" }]);
assert.equal(rest, 'data: {"type":"te');

console.log("agentMarkdown.selftest: ok");
