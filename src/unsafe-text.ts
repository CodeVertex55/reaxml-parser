/**
 * Character checks for text that came from a feed and may end up in a log, a terminal or an
 * identity. Internal to the package: nothing here is exported from the entry point.
 */

/**
 * Whether a code point is a control character: a C0 control (below 0x20), DEL (0x7F), a C1
 * control (0x80 to 0x9F), or the Unicode line separator (U+2028) or paragraph separator
 * (U+2029). Any of these can start a new line or drive a terminal.
 */
export function isControlCharacter(codePoint: number): boolean {
  return (
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029
  );
}

/**
 * Whether a code point is a bidirectional formatting character: the left-to-right and
 * right-to-left marks (U+200E, U+200F), the embeddings and overrides (U+202A to U+202E) and the
 * isolates (U+2066 to U+2069). These can make text read differently from how it is stored.
 */
function isBidiControl(codePoint: number): boolean {
  return (
    codePoint === 0x200e ||
    codePoint === 0x200f ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}

/** Whether a code point is unsafe to print: a control character or a bidirectional control. */
export function isUnsafeCharacter(codePoint: number): boolean {
  return isControlCharacter(codePoint) || isBidiControl(codePoint);
}

/** Whether the text holds any control character, as defined by `isControlCharacter`. */
export function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    if (isControlCharacter(char.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/** The text with every unsafe character, as defined by `isUnsafeCharacter`, replaced. */
export function replaceUnsafe(text: string, replacement: string): string {
  let out = "";
  for (const char of text) {
    out += isUnsafeCharacter(char.codePointAt(0) ?? 0) ? replacement : char;
  }
  return out;
}

/** The first `max` code points of the text, so a surrogate pair is never split in two. */
export function truncateCodePoints(text: string, max: number): string {
  let count = 0;
  let end = 0;
  for (const char of text) {
    if (count === max) return text.slice(0, end);
    count += 1;
    end += char.length;
  }
  return text;
}
