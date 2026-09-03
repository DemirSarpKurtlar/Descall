/**
 * Run: node frontend/src/components/dimaai/dimaMarkdown.selftest.mjs
 */
import assert from "node:assert/strict";
import { parseDimaMarkdown, renderDimaMarkdown } from "./dimaMarkdown.js";

const json = renderDimaMarkdown('```json\n{"recipient":"yigit","content":"sa"}\n```');
assert.equal(json.includes('class="dima-syn-kw">class'), false, "JSON highlight must not leak class= into visible text");
assert.match(json, /dima-syn-str/);
assert.match(json, /recipient/);

const js = renderDimaMarkdown("```js\nclass Foo { x = \"hi\"; }\n```");
assert.match(js, /dima-syn-kw">class</);
assert.equal(js.includes('class="dima-syn-kw">class</span>="dima-syn'), false);
assert.match(js, /dima-syn-str/);

const closed = parseDimaMarkdown("```html\n<div>hi</div>\n```");
assert.equal(closed.length, 1);
assert.equal(closed[0].type, "code");
assert.equal(closed[0].lang, "html");
assert.equal(closed[0].code, "<div>hi</div>");
assert.equal(closed[0].unclosed, false);

const open = parseDimaMarkdown("```html\n<!DOCTYPE html>\n<html>\n<body>");
assert.equal(open.length, 1);
assert.equal(open[0].type, "code");
assert.equal(open[0].unclosed, true);
assert.match(open[0].code, /<!DOCTYPE html>/);
assert.equal(open.some((b) => b.type === "p"), false, "unclosed HTML must not flash as paragraphs");

const indented = parseDimaMarkdown("  ```js\nconst x = 1;\n  ```");
assert.equal(indented[0].type, "code");
assert.equal(indented[0].lang, "js");
assert.equal(indented[0].unclosed, false);
assert.equal(indented[0].code, "const x = 1;");

const prefix = parseDimaMarkdown("Sure:\n```");
assert.equal(prefix[prefix.length - 1].type, "code");
assert.equal(prefix[prefix.length - 1].unclosed, true);

const ticks = parseDimaMarkdown("``");
assert.equal(ticks.length, 1);
assert.equal(ticks[0].type, "code");
assert.equal(ticks[0].unclosed, true);

const afterClose = parseDimaMarkdown("```js\nconst x = 1;\n```\nDone.");
assert.equal(afterClose[0].type, "code");
assert.equal(afterClose[0].unclosed, false);
assert.equal(afterClose[1].type, "p");
assert.equal(afterClose[1].text, "Done.");

const numbered = parseDimaMarkdown("1. First\n2. Second\n\nGo.");
assert.equal(numbered[0].type, "ol");
assert.deepEqual(numbered[0].items, ["First", "Second"]);
assert.equal(numbered[1].type, "blank");
assert.equal(numbered[2].type, "p");

console.log("dimaMarkdown.selftest.mjs: ok");
