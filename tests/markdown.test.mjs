/**
 * Markdown renderer tests — pure parser/IR + URL safety (no DOM needed).
 * The DOM layer (renderMarkdown) is a 1:1 mapping of this IR using
 * textContent only, so IR correctness + safeUrl cover the security model.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseMarkdown, parseInline, safeUrl,
} from "../js/utils/markdown.js";

/* ---------------- Basic inline ---------------- */

test("headings level 1-3", () => {
  const blocks = parseMarkdown("# one\n## two\n### three");
  assert.deepEqual(blocks.map((b) => b.level), [1, 2, 3]);
  assert.equal(blocks[0].type, "heading");
});

test("#### and deeper are NOT headings (plain text)", () => {
  const blocks = parseMarkdown("#### four");
  assert.equal(blocks[0].type, "paragraph");
  assert.equal(blocks[0].children[0].v.includes("four"), true);
});

test("bold / italic / strikethrough", () => {
  const nodes = parseInline("**b** *i* ~~s~~");
  assert.deepEqual(nodes.map((n) => n.t), ["bold", "text", "italic", "text", "strike"]);
});

test("inline code is preserved verbatim (no nested formatting)", () => {
  const nodes = parseInline("`**not bold**`");
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].t, "code");
  assert.equal(nodes[0].children[0].v, "**not bold**");
});

test("nested formatting inside bold", () => {
  const [node] = parseInline("**bold *italic* text**");
  assert.equal(node.t, "bold");
  assert.ok(node.children.some((c) => c.t === "italic"));
  // Known limitation (documented): `***triple***` closures resolve greedily
  // to the outer marker; a literal "*" may remain. Accepted for this
  // intentionally minimal renderer.
});


/* ---------------- Blocks ---------------- */

test("unordered list", () => {
  const [list] = parseMarkdown("- a\n- b\n- c");
  assert.equal(list.type, "list");
  assert.equal(list.ordered, false);
  assert.equal(list.items.length, 3);
});

test("ordered list", () => {
  const [list] = parseMarkdown("1. first\n2. second\n3. third");
  assert.equal(list.ordered, true);
  assert.equal(list.items.length, 3);
});

test("blockquote groups consecutive lines", () => {
  const [q] = parseMarkdown("> line one\n> line two");
  assert.equal(q.type, "quote");
  // Quote content is re-parsed as blocks; both lines survive inside it.
  const flat = JSON.stringify(q.children);
  assert.ok(flat.includes("line one"));
  assert.ok(flat.includes("line two"));
});

test("fenced code block keeps raw text including markup chars", () => {
  const [code] = parseMarkdown('```js\nconst x = "<b>raw</b>";\n```');
  assert.equal(code.type, "code");
  assert.equal(code.lang, "js");
  assert.equal(code.text, 'const x = "<b>raw</b>";');
});

test("unterminated fence consumes to EOF without throwing", () => {
  const [code] = parseMarkdown("```\nnever closed");
  assert.equal(code.type, "code");
  assert.equal(code.text, "never closed");
});

test("multiple paragraphs separated by blank lines", () => {
  const blocks = parseMarkdown("one\n\ntwo\n\nthree");
  assert.equal(blocks.filter((b) => b.type === "paragraph").length, 3);
});

/* ---------------- Checkboxes ---------------- */

test("checkboxes unchecked and checked", () => {
  const [list] = parseMarkdown("- [ ] todo\n- [x] done\n- [X] also done");
  assert.deepEqual(list.items.map((i) => i.checked), [false, true, true]);
});

test("malformed checkbox stays plain list text", () => {
  const [list] = parseMarkdown("- [x ] bad\n- []also bad");
  assert.deepEqual(list.items.map((i) => i.checked), [null, null]);
});


/* ---------------- Links & URLs ---------------- */

test("links with allowed protocols parse to link nodes", () => {
  for (const url of ["https://example.com", "http://example.com/x", "mailto:a@b.c"]) {
    const [node] = parseInline(`[t](${url})`);
    assert.equal(node.t, "link", url);
    assert.equal(node.href, url);
  }
});

test("relative (schemeless) urls are allowed", () => {
  const [node] = parseInline("[t](/local/page)");
  assert.equal(node.t, "link");
  assert.equal(node.href, "/local/page");
});

test("javascript:, data:, vbscript: links are rejected → plain text", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox", "JaVaScRiPt:x"]) {
    const [node] = parseInline(`[XSS](${url})`);
    assert.equal(node.t, "text", url);
    assert.match(node.v, /^\[XSS\]/); // rendered as literal text
  }
});

test("safeUrl rejects control characters and whitespace tricks", () => {
  assert.equal(safeUrl("java\tscript:alert(1)"), null);
  assert.equal(safeUrl(" jav ascript:x"), null);
  assert.equal(safeUrl(""), null);
});

/* ---------------- Security ---------------- */

test("raw <script> is inert text in the IR — never an html node type", () => {
  const blocks = parseMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
  const allNodes = JSON.stringify(blocks);
  assert.doesNotMatch(allNodes, /"type"\s*:\s*"html"/);
  assert.doesNotMatch(allNodes, /"tag"/);
  // The characters survive only as plain text values.
  assert.match(allNodes, /<script>alert\(1\)<\/script>/);
});

test("anchor injection attempt is treated as literal text", () => {
  const [node] = parseInline('<a href="javascript:alert(1)">XSS</a>');
  assert.equal(node.t, "text"); // raw HTML is not parsed at all
});

/* ---------------- Edge cases ---------------- */

test("empty and whitespace-only sources produce zero blocks", () => {
  assert.deepEqual(parseMarkdown(""), []);
  assert.deepEqual(parseMarkdown("   \n\t\n  "), []);
});

test("long single line stays one paragraph (no layout-breaking structure)", () => {
  const blocks = parseMarkdown("x".repeat(5000));
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
});

test("unicode / arabic / mixed RTL-LTR text passes through untouched", () => {
  const src = "# مرحبا\n\nHello 🌲 — *ملاحظة* mixed עברית";
  const blocks = parseMarkdown(src);
  const flat = JSON.stringify(blocks);
  assert.ok(flat.includes("مرحبا"));
  assert.ok(flat.includes("🌲"));
  assert.ok(flat.includes("ملاحظة"));
});

