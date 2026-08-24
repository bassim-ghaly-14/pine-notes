/**
 * Safe search highlighting.
 *
 * Returns a DocumentFragment containing plain text nodes plus <mark>
 * elements for case-insensitive matches. Because EVERY character enters
 * the DOM via createTextNode / textContent, user content can never be
 * interpreted as markup — XSS is structurally impossible here.
 */

/**
 * @param {string} text  User-controlled text.
 * @param {string} query Current search query (may be "").
 * @returns {DocumentFragment}
 */
export function highlightText(text, query) {
  const fragment = document.createDocumentFragment();
  const value = String(text ?? "");
  const needle = String(query ?? "").trim();

  if (!needle) {
    fragment.appendChild(document.createTextNode(value));
    return fragment;
  }

  const lowerValue = value.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let cursor = 0;

  let index = lowerValue.indexOf(lowerNeedle, cursor);
  while (index !== -1) {
    if (index > cursor) {
      fragment.appendChild(document.createTextNode(value.slice(cursor, index)));
    }
    const mark = document.createElement("mark");
    mark.textContent = value.slice(index, index + needle.length);
    fragment.appendChild(mark);
    cursor = index + needle.length;
    index = lowerValue.indexOf(lowerNeedle, cursor);
  }

  if (cursor < value.length) {
    fragment.appendChild(document.createTextNode(value.slice(cursor)));
  }
  return fragment;
}