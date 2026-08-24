/**
 * Minimal, dependency-free Markdown engine. PURE — no state, no storage,
 * no persistence knowledge. Two layers:
 *
 *   1. parseMarkdown(source) → intermediate representation (IR) of blocks
 *      and inline nodes. Pure string logic; independently testable.
 *   2. renderMarkdown(source | IR) → DocumentFragment built exclusively
 *      with createElement/textContent. NO innerHTML anywhere, so user
 *      content can never become executable markup (XSS structurally
 *      impossible — same model as highlight.js / noteCard.js).
 *
 * Supported syntax (intentionally limited):
 *   # / ## / ### headings · **bold** · *italic* · ~~strike~~ · `code`
 *   ``` fenced code blocks ``` · "- " lists · "1." ordered lists
 *   - [ ] / - [x] checkboxes · "> " blockquotes · [text](url)
 *
 * Security:
 *   - Raw HTML is NEVER parsed — "<script>" is just text characters in a
 *     text node.
 *   - Link URLs pass safeUrl(): only http:, https:, mailto: and schemeless
 *     relative URLs survive; javascript:/data:/vbscript: return null and
 *     the link renders as plain text.
 */

export const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

/**
 * Validate a URL from user content. Returns the sanitized href or null
 * when the protocol is not allowed (caller must then render plain text).
 */
export function safeUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return null;
  // Control characters / whitespace inside the scheme can trick parsers.
  if (/[\s\u0000-\u001f]/.test(value)) return null;
  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!schemeMatch) {
    // No scheme → relative URL → cannot execute a handler.
    return value;
  }
  return SAFE_PROTOCOLS.includes(schemeMatch[1].toLowerCase() + ":") ? value : null;
}

/* ------------------------------------------------------------------ */
/* Inline parsing                                                      */
/* ------------------------------------------------------------------ */

const INLINE_RULES = [
  { t: "code", re: /^`([^`\n]+)`/, raw: true },
  { t: "bold", re: /^\*\*((?:[^*\n]|\*(?!\*))*)\*\*/ },
  { t: "strike", re: /^~~((?:[^~\n]|~(?!~))*)~~/, raw: false },
  { t: "italic", re: /^\*(?!\*)([^*\n]+)\*/ },
  { t: "link", re: /^\[([^\]\n]*)\]\(([^()\s]+)\)/ },
];

/** text → [{t:"text"|"bold"|..., ...}] */
export function parseInline(text) {
  const nodes = [];
  let buffer = "";
  let rest = String(text ?? "");
  let pos = 0;

  const flush = () => {
    if (buffer) {
      nodes.push({ t: "text", v: buffer });
      buffer = "";
    }
  };

  while (pos < rest.length) {
    let matched = false;
    for (const rule of INLINE_RULES) {
      const m = rest.slice(pos).match(rule.re);
      if (m) {
        flush();
                if (rule.t === "link") {
          const href = safeUrl(m[2]);
          nodes.push(href ? { t: "link", href, text: m[1] } : { t: "text", v: m[0] });
        } else if (rule.raw) {
          // Code spans contain literal text — never parse formatting inside.
          nodes.push({ t: rule.t, children: [{ t: "text", v: m[1] }] });
        } else {
          nodes.push({ t: rule.t, children: parseInline(m[1]) });
        }
        pos += m[0].length;
        matched = true;
        break;
      }
    }
        if (!matched) {
      buffer += rest[pos];
      pos += 1;
    }
  }
  flush();
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Block parsing                                                       */
/* ------------------------------------------------------------------ */

const CHECKBOX_RE = /^\[([ xX])\]\s+(.*)$/;

/**
 * source → [{type:"heading"|"paragraph"|"code"|"quote"|"list", ...}]
 * Lists carry {ordered, items:[{checked:null|boolean, children:inline[]}]}.
 */
export function parseMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const codeLines = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence (or EOF)
      blocks.push({ type: "code", lang: fence[1] || "", text: codeLines.join("\n") });
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Heading (# to ###)
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, children: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    // Blockquote (> …)
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({
        type: "quote",
        children: parseMarkdown(quoteLines.join("\n")), // nested blocks
      });
      continue;
    }

    // List item (- / * / 1. with optional [ ] checkbox)
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered && !bullet);
      const list = { type: "list", ordered: isOrdered, items: [] };
      while (i < lines.length) {
        const current = lines[i];
        const b = current.match(/^\s*[-*]\s+(.*)$/);
        const o = current.match(/^\s*\d+[.)]\s+(.*)$/);
        const rawItem = isOrdered ? o?.[1] : b?.[1];
        if ((isOrdered ? b : o) || !rawItem) break;
        const check = rawItem.match(CHECKBOX_RE);
        list.items.push({
          checked: check ? check[1].toLowerCase() === "x" : null,
          children: parseInline(check ? check[2] : rawItem),
        });
        i += 1;
      }
      blocks.push(list);
      continue;
    }

    // Paragraph (consecutive non-special lines)
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|>|```|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
        blocks.push({ type: "paragraph", children: parseInline(paraLines.join("\n")) });
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/* DOM rendering (the ONLY place IR becomes elements)                  */
/* ------------------------------------------------------------------ */

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Inline IR → fragment. All text via textContent; links via safeUrl result. */
export function renderInline(nodes, root = document.createDocumentFragment()) {
  for (const node of nodes ?? []) {
    switch (node.t) {
      case "text":
        root.appendChild(document.createTextNode(node.v));
        break;
      case "code": {
        const code = el("code", "md-code");
        code.textContent = node.children.map((c) => c.v ?? "").join("");
        root.appendChild(code);
        break;
      }
      case "bold":
      case "italic":
      case "strike": {
        const tag = node.t === "bold" ? "strong" : node.t === "italic" ? "em" : "del";
        const wrapper = el(tag);
        renderInline(node.children, wrapper);
        root.appendChild(wrapper);
        break;
      }
      case "link": {
        // node.href already passed safeUrl() at parse time; belt & braces:
        const href = safeUrl(node.href);
        if (href) {
          const a = el("a", "md-link");
          a.href = href;
          a.textContent = node.text || href;
          a.target = "_blank";
          a.rel = "noopener noreferrer nofollow";
          root.appendChild(a);
        } else {
          root.appendChild(document.createTextNode(`[${node.text}](${node.href})`));
        }
        break;
      }
      default:
        root.appendChild(document.createTextNode(String(node.v ?? "")));
    }
  }
  return root;
}

/** Render block IR into a container element ("md" class). */
export function renderBlocks(blocks, container) {
  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const h = el(`h${Math.min(block.level + 2, 6)}`, `md-h md-h${block.level}`);
        renderInline(block.children, h); // h3-h5 keeps document outline sane inside cards
        container.appendChild(h);
        break;
      }
      case "paragraph": {
        if (block.children.length === 0) break; // whitespace-only → nothing
        const p = el("p", "md-p");
        renderInline(block.children, p);
        container.appendChild(p);
        break;
      }
      case "code": {
        const pre = el("pre", "md-pre");
        const code = el("code", null);
        code.textContent = block.text; // raw text — never markup
        pre.appendChild(code);
        container.appendChild(pre);
        break;
      }
      case "quote": {
        const q = el("blockquote", "md-quote");
        renderBlocks(block.children, q);
        container.appendChild(q);
        break;
      }
      case "list": {
        const listEl = el(block.ordered ? "ol" : "ul", `md-list${block.ordered ? " md-ol" : ""}`);
        for (const item of block.items) {
          const li = el("li", "md-li");
          if (item.checked === null) {
            renderInline(item.children, li);
          } else {
            // Markdown checklist — visual only; NOT a Task Note item.
            li.classList.add("md-check");
            const label = el("label", "md-check-label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.className = "md-checkbox";
            box.checked = item.checked;
            box.disabled = true;
            box.setAttribute("aria-label", item.checked ? "Completed task" : "Incomplete task");
            label.append(box);
            const span = el("span");
            span.setAttribute("aria-hidden", "false");
            renderInline(item.children, span);
            label.appendChild(span);
            li.appendChild(label);
          }
          listEl.appendChild(li);
        }
        container.appendChild(listEl);
        break;
      }
    }
  }
  return container;
}

/**
 * Public API: markdown source → DocumentFragment of rendered content.
 * Empty / whitespace-only source produces an EMPTY fragment (no stray
 * containers). Used by note cards AND the editor preview.
 */
export function renderMarkdown(source) {
  const container = el("div", "md");
  const blocks = parseMarkdown(source);
  renderBlocks(blocks, container);
  return container;
}
