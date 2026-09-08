/**
 * The one definition of "this class names a shade rather than a role", read by
 * both guards that enforce it.
 *
 * There are two, at different levels: `tests/unit/app/theme-tokens.test.ts`
 * scans the source, and `tests/e2e/dark-mode.spec.ts` scans the stylesheet the
 * running app actually serves. They were written as separate copies of the
 * same rule and had already drifted — the source guard knew about
 * `bg-[#fafafa]` while the stylesheet guard did not — which is exactly the
 * failure a shared definition removes rather than documents.
 *
 * See src/app/globals.css for the rule itself: a component names a role,
 * never a shade.
 */

/** Tailwind's palette, plus the two absolutes. */
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

/** Every utility that paints something. */
const PAINTING_UTILITY =
  "(?:bg|text|border|ring|divide|outline|decoration|shadow|from|via|to|caret|accent|fill|stroke|placeholder)";

/** `bg-zinc-500/15` and `bg-white/50`; Tailwind allows a bracketed value too. */
const OPACITY_MODIFIER = "(?:\\/(?:\\d+|\\[[^\\]]*\\]))?";

/**
 * Tailwind's important marker. v4 writes it as a suffix (`bg-zinc-500!`) and
 * v3 as a prefix (`!bg-zinc-500`); both are allowed here, because which one a
 * given file uses is not the point — the shade is.
 */
const IMPORTANT = "!?";

/**
 * One variant, which is not always a word. `hover:` and `sm:` are, but an
 * arbitrary variant carries a bracketed expression — `data-[state=open]:`,
 * `[&>svg]:`, `supports-[display:grid]:` — and a prefix that only allowed
 * `[\w-]+` stopped at the first bracket, letting `data-[state=open]:bg-zinc-500`
 * through both guards.
 */
const VARIANT = "(?:(?:[\\w-]|\\[[^\\]]*\\])+:)";

/**
 * A painting utility whose colour is a shade or a literal, with no anchors, so
 * each guard can anchor it for what it is matching: a bare class name in the
 * source, or a class inside a CSS selector.
 */
const HARDCODED_COLOUR_SOURCE = `${IMPORTANT}${PAINTING_UTILITY}-(?:(?:${SHADES.join("|")})(?:-\\d{2,3})?|\\[(?:#|rgb|hsl|oklch|lab)[^\\]]*\\])${OPACITY_MODIFIER}${IMPORTANT}`;

/**
 * One class name, as written in a `className`, with its variants already
 * stripped by the caller.
 */
export const HARDCODED_COLOUR_CLASS = new RegExp(`^${HARDCODED_COLOUR_SOURCE}$`);

/**
 * The same utility as it appears in a CSS selector, variants and all.
 *
 * The variant prefix is what makes this differ from the class form, and
 * leaving it out was a real gap: Tailwind writes `hover:bg-zinc-500/15` as
 * `.hover\:bg-zinc-500\/15:hover`, where the dot sits before `hover` rather
 * than before `bg`, so a pattern anchored on `\.bg` walked past every variant
 * of every shade. The trailing guard stops a role from matching on a prefix of
 * a longer one.
 */
const HARDCODED_COLOUR_SELECTOR = new RegExp(`\\.${VARIANT}*${HARDCODED_COLOUR_SOURCE}(?![\\w-])`);

/**
 * Whether one CSS selector paints with a shade.
 *
 * A function rather than an exported pattern, so the browser-side guard hands
 * its selectors back to Node and matches here. Passing a pattern into
 * `page.evaluate` would mean the matching itself lived in two places again —
 * which is how the arbitrary-colour case came to be missing from one of them.
 *
 * Tailwind escapes `:` and `/` in a selector; the class underneath is what
 * this is about.
 */
export function paintsWithShade(selector: string): boolean {
  return HARDCODED_COLOUR_SELECTOR.test(selector.replaceAll("\\", ""));
}
