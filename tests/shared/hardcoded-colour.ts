/**
 * The one definition of "this class names a shade, not a role", read by both
 * guards that enforce it: the one that scans the source and the one that scans
 * the stylesheet the running app serves.
 *
 * decisions/269-colour-roles.md
 */

/**
 * Tailwind's palette, plus the two absolutes.
 *
 * decisions/269-colour-roles.md
 */
const SHADES = [
  "white",
  "black",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

/**
 * Every utility that paints something.
 *
 * decisions/269-colour-roles.md
 */
const PAINTING_UTILITY =
  "(?:bg|text|border|ring|divide|outline|decoration|shadow|from|via|to|caret|accent|fill|stroke|placeholder)";

/**
 * `bg-zinc-500/15` and `bg-white/50`; Tailwind allows a bracketed value too.
 *
 * decisions/269-colour-roles.md
 */
const OPACITY_MODIFIER = "(?:\\/(?:\\d+|\\[[^\\]]*\\]))?";

/**
 * Tailwind's important marker: a suffix in v4 (`bg-zinc-500!`) and a prefix in
 * v3 (`!bg-zinc-500`). Both are allowed here.
 *
 * decisions/269-colour-roles.md
 */
const IMPORTANT = "!?";

/**
 * One variant, which is not always a word: `hover:` and `sm:` are, but an
 * arbitrary variant carries a bracketed expression, as in `data-[state=open]:`.
 *
 * decisions/269-colour-roles.md
 */
const VARIANT = "(?:(?:[\\w-]|\\[[^\\]]*\\])+:)";

/**
 * A painting utility whose colour is a shade or a literal, with no anchors, so
 * each guard can anchor it for what it is matching.
 *
 * decisions/269-colour-roles.md
 */
const HARDCODED_COLOUR_SOURCE = `${IMPORTANT}${PAINTING_UTILITY}-(?:(?:${SHADES.join("|")})(?:-\\d{2,3})?|\\[(?:#|rgb|hsl|oklch|lab)[^\\]]*\\])${OPACITY_MODIFIER}${IMPORTANT}`;

/**
 * One class name, as written in a `className`, with its variants already
 * stripped by the caller.
 *
 * decisions/269-colour-roles.md
 */
export const HARDCODED_COLOUR_CLASS = new RegExp(`^${HARDCODED_COLOUR_SOURCE}$`);

/**
 * The same utility as it appears in a CSS selector. Tailwind writes the variant
 * first (`.hover\:bg-…`), so variants are allowed after the dot; the trailing
 * guard stops a role from matching on a prefix of a longer one.
 *
 * decisions/269-colour-roles.md
 */
const HARDCODED_COLOUR_SELECTOR = new RegExp(`\\.${VARIANT}*${HARDCODED_COLOUR_SOURCE}(?![\\w-])`);

/**
 * Whether one CSS selector paints with a shade. Tailwind escapes `:` and `/`
 * in a selector, hence the unescaping. A function, so the browser-side guard
 * hands its selectors back to Node and matches here.
 *
 * decisions/269-colour-roles.md
 */
export function paintsWithShade(selector: string): boolean {
  return HARDCODED_COLOUR_SELECTOR.test(selector.replaceAll("\\", ""));
}
