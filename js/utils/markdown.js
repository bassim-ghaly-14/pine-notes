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

export const SAFE_PROTOCOLS = [
  "http:",
  "https:",
  "mailto:",
];

/**
 * Validate a URL from user content.
 * Returns the sanitized href or null when the protocol is not allowed.
 */
export function safeUrl(url) {
  const value = String(url ?? "").trim();

  if (!value) {
    return null;
  }

  // Control characters / whitespace inside the scheme can trick parsers.
  if (/[\s\u0000-\u001f]/.test(value)) {
    return null;
  }

  const schemeMatch = value.match(
    /^([a-zA-Z][a-zA-Z0-9+.-]*):/
  );

  if (!schemeMatch) {
    // No scheme → relative URL → cannot execute a handler.
    return value;
  }

  const protocol = `${schemeMatch[1].toLowerCase()}:`;

  return SAFE_PROTOCOLS.includes(protocol) ? value : null;
}

/* ------------------------------------------------------------------ */
/* Inline parsing                                                      */
/* ------------------------------------------------------------------ */

const INLINE_RULES = [
  {
    t: "code",
    re: /^`([^`\n]+)`/,
    raw: true,
  },
  {
    t: "bold",
    re: /^\*\*((?:[^*\n]|\*(?!\*))*)\*\*/,
  },
  {
    t: "strike",
    re: /^~~((?:[^~\n]|~(?!~))*)~~/,
    raw: false,
  },
  {
    t: "italic",
    re: /^\*(?!\*)([^*\n]+)\*/,
  },
  {
    t: "link",
    re: /^$begin:math:display$\(\[\^$end:math:display$\n]*)\]$begin:math:text$\(\[\^\(\)\\s\]\+\)$end:math:text$/,
  },
];

/**
 * text → [{t:"text"|"bold"|..., ...}]
 */
export function parseInline(text) {
  const nodes = [];
  let buffer = "";
  const rest = String(text ?? "");
  let pos = 0;

  const flush = () => {
    if (!buffer) {
      return;
    }

    nodes.push({
      t: "text",
      v: buffer,
    });

    buffer = "";
  };

  while (pos < rest.length) {
    const match = findInlineMatch(rest, pos);

    if (match) {
      flush();
      nodes.push(createInlineNode(match.rule, match.match));
      pos += match.match[0].length;
      continue;
    }

    buffer += rest[pos];
    pos += 1;
  }

  flush();

  return nodes;
}

function findInlineMatch(source, position) {
  for (const rule of INLINE_RULES) {
    const match = source.slice(position).match(rule.re);

    if (match) {
      return {
        rule,
        match,
      };
    }
  }

  return null;
}

function createInlineNode(rule, match) {
  if (rule.t === "link") {
    return createLinkNode(match);
  }

  if (rule.raw) {
    return {
      t: rule.t,
      children: [
        {
          t: "text",
          v: match[1],
        },
      ],
    };
  }

  return {
    t: rule.t,
    children: parseInline(match[1]),
  };
}

function createLinkNode(match) {
  const href = safeUrl(match[2]);

  if (!href) {
    return {
      t: "text",
      v: match[0],
    };
  }

  return {
    t: "link",
    href,
    text: match[1],
  };
}

/* ------------------------------------------------------------------ */
/* Block parsing                                                       */
/* ------------------------------------------------------------------ */

const CHECKBOX_RE = /^$begin:math:display$\(\[ xX\]\)$end:math:display$\s+(.*)$/;
const SPECIAL_LINE_RE =
  /^(#{1,3}\s|>|```|\s*[-*]\s|\s*\d+[.)]\s)/;

/**
 * source → [{type:"heading"|"paragraph"|"code"|"quote"|"list", ...}]
 *
 * Lists carry:
 * {
 *   ordered,
 *   items: [{checked:null|boolean, children:inline[]}]
 * }
 */
export function parseMarkdown(source) {
  const lines = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const result = parseBlock(lines, index);

    if (!result) {
      index += 1;
      continue;
    }

    if (result.block) {
      blocks.push(result.block);
    }

    index = result.nextIndex;
  }

  return blocks;
}

function parseBlock(lines, index) {
  const line = lines[index];

  const fence = parseFencedCode(lines, index);

  if (fence) {
    return fence;
  }

  if (!line.trim()) {
    return {
      block: null,
      nextIndex: index + 1,
    };
  }

  const heading = parseHeading(line, index);

  if (heading) {
    return heading;
  }

  const quote = parseQuote(lines, index);

  if (quote) {
    return quote;
  }

  const list = parseList(lines, index);

  if (list) {
    return list;
  }

  return parseParagraph(lines, index);
}

function parseFencedCode(lines, index) {
  const fence = lines[index].match(/^```(\w*)\s*$/);

  if (!fence) {
    return null;
  }

  const codeLines = [];
  let cursor = index + 1;

  while (
    cursor < lines.length &&
    !/^```\s*$/.test(lines[cursor])
  ) {
    codeLines.push(lines[cursor]);
    cursor += 1;
  }

  // Skip closing fence when present.
  const nextIndex = cursor + 1;

  return {
    block: {
      type: "code",
      lang: fence[1] || "",
      text: codeLines.join("\n"),
    },
    nextIndex,
  };
}

function parseHeading(line, index) {
  const heading = line.match(
    /^(#{1,3})\s+(.*)$/
  );

  if (!heading) {
    return null;
  }

  return {
    block: {
      type: "heading",
      level: heading[1].length,
      children: parseInline(heading[2]),
    },
    nextIndex: index + 1,
  };
}

function parseQuote(lines, index) {
  if (!/^>\s?/.test(lines[index])) {
    return null;
  }

  const quoteLines = [];
  let cursor = index;

  while (
    cursor < lines.length &&
    /^>\s?/.test(lines[cursor])
  ) {
    quoteLines.push(
      lines[cursor].replace(/^>\s?/, "")
    );

    cursor += 1;
  }

  return {
    block: {
      type: "quote",
      children: parseMarkdown(quoteLines.join("\n")),
    },
    nextIndex: cursor,
  };
}

function parseList(lines, index) {
  const listInfo = getListInfo(lines[index]);

  if (!listInfo) {
    return null;
  }

  const list = {
    type: "list",
    ordered: listInfo.ordered,
    items: [],
  };

  let cursor = index;

  while (cursor < lines.length) {
    const item = parseListItem(
      lines[cursor],
      listInfo.ordered
    );

    if (!item) {
      break;
    }

    list.items.push(item);
    cursor += 1;
  }

  return {
    block: list,
    nextIndex: cursor,
  };
}

function getListInfo(line) {
  const bullet = line.match(
    /^\s*[-*]\s+(.*)$/
  );

  const ordered = line.match(
    /^\s*(\d+)[.)]\s+(.*)$/
  );

  if (!bullet && !ordered) {
    return null;
  }

  return {
    ordered: Boolean(ordered && !bullet),
  };
}

function parseListItem(line, isOrdered) {
  const bullet = line.match(
    /^\s*[-*]\s+(.*)$/
  );

  const ordered = line.match(
    /^\s*\d+[.)]\s+(.*)$/
  );

  const rawItem = isOrdered
    ? ordered?.[1]
    : bullet?.[1];

  if (!rawItem) {
    return null;
  }

  // Do not allow a different list type to become part
  // of the current list.
  if (isOrdered ? bullet : ordered) {
    return null;
  }

  const check = rawItem.match(CHECKBOX_RE);
  const text = check ? check[2] : rawItem;

  return {
    checked: check
      ? check[1].toLowerCase() === "x"
      : null,
    children: parseInline(text),
  };
}

function parseParagraph(lines, index) {
  const paraLines = [];
  let cursor = index;

  while (
    cursor < lines.length &&
    lines[cursor].trim() &&
    !SPECIAL_LINE_RE.test(lines[cursor])
  ) {
    paraLines.push(lines[cursor]);
    cursor += 1;
  }

  return {
    block: {
      type: "paragraph",
      children: parseInline(
        paraLines.join("\n")
      ),
    },
    nextIndex: cursor,
  };
}

/* ------------------------------------------------------------------ */
/* DOM rendering (the ONLY place IR becomes elements)                  */
/* ------------------------------------------------------------------ */

function el(tag, className) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  return node;
}

/**
 * Inline IR → fragment.
 * All text via textContent; links via safeUrl result.
 */
export function renderInline(
  nodes,
  root = document.createDocumentFragment()
) {
  for (const node of nodes ?? []) {
    renderInlineNode(node, root);
  }

  return root;
}

function renderInlineNode(node, root) {
  switch (node.t) {
    case "text":
      renderTextNode(node, root);
      break;

    case "code":
      renderCodeNode(node, root);
      break;

    case "bold":
    case "italic":
    case "strike":
      renderFormattedNode(node, root);
      break;

    case "link":
      renderLinkNode(node, root);
      break;

    default:
      renderTextNode(
        {
          v: String(node.v ?? ""),
        },
        root
      );
  }
}

function renderTextNode(node, root) {
  root.appendChild(
    document.createTextNode(node.v)
  );
}

function renderCodeNode(node, root) {
  const code = el("code", "md-code");

  code.textContent = node.children
    .map((child) => child.v ?? "")
    .join("");

  root.appendChild(code);
}

function renderFormattedNode(node, root) {
  const tag = getFormattedTag(node.t);
  const wrapper = el(tag);

  renderInline(node.children, wrapper);
  root.appendChild(wrapper);
}

function getFormattedTag(type) {
  const tags = {
    bold: "strong",
    italic: "em",
    strike: "del",
  };

  return tags[type];
}

function renderLinkNode(node, root) {
  // node.href already passed safeUrl() at parse time;
  // validate again as defense in depth.
  const href = safeUrl(node.href);

  if (!href) {
    root.appendChild(
      document.createTextNode(
        `[${node.text}](${node.href})`
      )
    );
    return;
  }

  const link = el("a", "md-link");

  link.href = href;
  link.textContent = node.text || href;
  link.target = "_blank";
  link.rel = "noopener noreferrer nofollow";

  root.appendChild(link);
}

/**
 * Render block IR into a container element ("md" class).
 */
export function renderBlocks(blocks, container) {
  for (const block of blocks) {
    renderBlock(block, container);
  }

  return container;
}

function renderBlock(block, container) {
  const renderers = {
    heading: renderHeadingBlock,
    paragraph: renderParagraphBlock,
    code: renderCodeBlock,
    quote: renderQuoteBlock,
    list: renderListBlock,
  };

  const renderer = renderers[block.type];

  if (renderer) {
    renderer(block, container);
  }
}

function renderHeadingBlock(block, container) {
  const level = Math.min(
    block.level + 2,
    6
  );

  const heading = el(
    `h${level}`,
    `md-h md-h${block.level}`
  );

  renderInline(block.children, heading);
  container.appendChild(heading);
}

function renderParagraphBlock(block, container) {
  if (block.children.length === 0) {
    return;
  }

  const paragraph = el("p", "md-p");

  renderInline(
    block.children,
    paragraph
  );

  container.appendChild(paragraph);
}

function renderCodeBlock(block, container) {
  const pre = el("pre", "md-pre");
  const code = el("code");

  // Raw text — never markup.
  code.textContent = block.text;

  pre.appendChild(code);
  container.appendChild(pre);
}

function renderQuoteBlock(block, container) {
  const quote = el(
    "blockquote",
    "md-quote"
  );

  renderBlocks(block.children, quote);
  container.appendChild(quote);
}

function renderListBlock(block, container) {
  const className = block.ordered
    ? "md-list md-ol"
    : "md-list";

  const list = el(
    block.ordered ? "ol" : "ul",
    className
  );

  for (const item of block.items) {
    list.appendChild(
      renderListItem(item)
    );
  }

  container.appendChild(list);
}

function renderListItem(item) {
  const li = el("li", "md-li");

  if (item.checked === null) {
    renderInline(item.children, li);
    return li;
  }

  li.classList.add("md-check");

  const label = el(
    "label",
    "md-check-label"
  );

  const checkbox =
    document.createElement("input");

  checkbox.type = "checkbox";
  checkbox.className = "md-checkbox";
  checkbox.checked = item.checked;
  checkbox.disabled = true;

  checkbox.setAttribute(
    "aria-label",
    item.checked
      ? "Completed task"
      : "Incomplete task"
  );

  label.append(checkbox);

  const span = el("span");
  span.setAttribute(
    "aria-hidden",
    "false"
  );

  renderInline(item.children, span);

  label.appendChild(span);
  li.appendChild(label);

  return li;
}

/**
 * Public API: markdown source → rendered content element.
 *
 * Empty / whitespace-only source produces an empty container
 * with no stray content. Used by note cards AND editor preview.
 */
export function renderMarkdown(source) {
  const container = el("div", "md");
  const blocks = parseMarkdown(source);

  renderBlocks(blocks, container);

  return container;
}