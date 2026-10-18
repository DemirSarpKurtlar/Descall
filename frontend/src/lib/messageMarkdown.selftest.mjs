// Inline message markdown (**bold**, `code`, @mention, links, \* escapes).
// Run: node src/lib/messageMarkdown.selftest.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plainText, splitBlocks, tokenizeInline } from "./messageMarkdown.js";

const poll = "**Poll: Question**\n1. Option 1\n2. Option 2";
assert.deepEqual(tokenizeInline(poll), [
  { type: "bold", children: [{ type: "text", value: "Poll: Question" }] },
  { type: "text", value: "\n1. Option 1\n2. Option 2" },
]);
assert.equal(plainText(poll), "Poll: Question\n1. Option 1\n2. Option 2");

// Server escapes (slashCommands.js escapeMd) render as the literal character.
assert.deepEqual(tokenizeInline("**Poll: 2\\*3 \\_ok\\_?**"), [
  { type: "bold", children: [{ type: "text", value: "Poll: 2*3 _ok_?" }] },
]);
assert.deepEqual(tokenizeInline("a \\*\\*not bold\\*\\* b"), [{ type: "text", value: "a **not bold** b" }]);

// Mentions, links and code inside bold.
assert.deepEqual(tokenizeInline("**hi @demir see https://descall.com/x**"), [
  {
    type: "bold",
    children: [
      { type: "text", value: "hi " },
      { type: "mention", value: "@demir" },
      { type: "text", value: " see " },
      { type: "url", value: "https://descall.com/x" },
    ],
  },
]);
// Inline code wins over bold markers inside it.
assert.deepEqual(tokenizeInline("`**x**` and **y**"), [
  { type: "code", value: "**x**" },
  { type: "text", value: " and " },
  { type: "bold", children: [{ type: "text", value: "y" }] },
]);
// Unclosed / empty markers stay literal.
assert.deepEqual(tokenizeInline("** nope"), [{ type: "text", value: "** nope" }]);
assert.deepEqual(tokenizeInline("****"), [{ type: "text", value: "****" }]);
// Multi-line bold keeps its newline.
assert.deepEqual(tokenizeInline("**a\nb**"), [{ type: "bold", children: [{ type: "text", value: "a\nb" }] }]);

assert.deepEqual(splitBlocks("x\n```js\nconst a = '**';\n```\n**b**"), [
  { type: "inline", value: "x\n" },
  { type: "codeblock", value: "js\nconst a = '**';" },
  { type: "inline", value: "\n**b**" },
]);

const content = readFileSync(new URL("../components/chat/MessageContent.jsx", import.meta.url), "utf8");
assert.match(content, /tokenizeInline/);
assert.match(content, /<strong key=\{key\} className="msg-bold">/);
// The profanity mask ("***") runs per token, after parsing.
assert.doesNotMatch(content, /const text = displayText\(rawText\)/);
const polish = readFileSync(new URL("../styles/ui-polish.css", import.meta.url), "utf8");
assert.match(polish, /\.message-text \.msg-bold \{\s*font-weight: 700;/);
const base = readFileSync(new URL("../styles/messages.css", import.meta.url), "utf8");
assert.match(base, /\.message-text \{[^}]*white-space: pre-wrap;/);

console.log("messageMarkdown.selftest ok");
