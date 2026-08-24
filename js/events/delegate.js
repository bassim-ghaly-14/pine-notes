/**
 * Delegated event handling.
 *
 * Replaces V1's inline onclick="globalFn()" attributes: a single listener
 * per container reacts to elements carrying a data-action attribute,
 * passing the enclosing [data-id] value.
 *
 * Supports:
 * - "data-action"
 * - "data-task-action"
 * - "[data-action]"
 * - "[data-task-action]"
 *
 * No globals, no CSP issues, and handlers survive re-renders for free.
 *
 * @param {Element} root       Container to observe (events bubble here).
 * @param {string} type        DOM event type ("click", "input", …).
 * @param {string} actionAttr  Attribute name to match, e.g. "data-action".
 * @param {(value: string|null, el: Element, event: Event) => void} handler
 */
export function delegate(root, type, actionAttr, handler) {
  if (!(root instanceof Element)) {
    throw new TypeError("delegate(): root must be an Element");
  }

  if (typeof type !== "string" || !type.trim()) {
    throw new TypeError("delegate(): type must be a non-empty string");
  }

  if (typeof actionAttr !== "string" || !actionAttr.trim()) {
    throw new TypeError(
      "delegate(): actionAttr must be a non-empty string"
    );
  }

  if (typeof handler !== "function") {
    throw new TypeError(
      "delegate(): handler must be a function"
    );
  }

  /*
   * Normalize the attribute input.
   *
   * Valid:
   *   data-action
   *   data-task-action
   *   [data-action]
   *   [data-task-action]
   *
   * Invalid:
   *   [[data-task-action]]
   *   .some-class
   *   #some-id
   *
   * The old implementation directly interpolated actionAttr into
   * closest(), which allowed an invalid value to produce a
   * SyntaxError from the browser's selector parser.
   */
  const normalizedAttr = normalizeAttributeName(actionAttr);

  if (!normalizedAttr) {
    throw new TypeError(
      `delegate(): invalid attribute name "${actionAttr}"`
    );
  }

  const selector = `[${normalizedAttr}]`;

  root.addEventListener(type, (event) => {
    const target =
      event.target instanceof Element
        ? event.target
        : null;

    if (!target) {
      return;
    }

    const el = target.closest(selector);

    if (!el || !root.contains(el)) {
      return;
    }

    handler(
      el.getAttribute(normalizedAttr),
      el,
      event
    );
  });
}

/**
 * Convert supported attribute input into a safe attribute name.
 *
 * Examples:
 *   "data-action"          -> "data-action"
 *   "[data-action]"        -> "data-action"
 *   "[[data-action]]"      -> null
 */
function normalizeAttributeName(value) {
  let name = value.trim();

  /*
   * Accept one pair of selector brackets for convenience.
   */
  if (
    name.startsWith("[") &&
    name.endsWith("]")
  ) {
    name = name.slice(1, -1).trim();
  }

  /*
   * Reject anything that still looks like a selector.
   *
   * This specifically prevents values such as:
   *   [[data-task-action]]
   */
  if (
    name.includes("[") ||
    name.includes("]") ||
    name.includes(" ") ||
    name.includes("#") ||
    name.includes(".") ||
    name.includes(":") ||
    name.includes(">") ||
    name.includes("*") ||
    name.includes("=") ||
    name.includes('"') ||
    name.includes("'")
  ) {
    return null;
  }

  /*
   * HTML attribute names may contain letters, numbers, hyphens,
   * underscores and a few other valid characters. For this project,
   * data-* attributes are the intended contract, so keep the API
   * deliberately strict.
   */
  if (!/^data-[a-zA-Z0-9_-]+$/.test(name)) {
    return null;
  }

  return name;
}