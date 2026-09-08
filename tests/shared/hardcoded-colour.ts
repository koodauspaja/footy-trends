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
 * A painting utility whose colour is a shade or a literal, with no anchors, so
 * each guard can anchor it for what it is matching: a bare class name in the
 * source, or a class inside a CSS selector.
 *
 * Passed to the browser as a string rather than a `RegExp`, because
 * `page.evaluate` serialises its argument and a `RegExp` does not survive.
 */
export const HARDCODED_COLOUR_SOURCE = `${PAINTING_UTILITY}-(?:(?:${SHADES.join("|")})(?:-\\d{2,3})?|\\[(?:#|rgb|hsl|oklch|lab)[^\\]]*\\])${OPACITY_MODIFIER}`;

/** One class name, as written in a `className`. */
export const HARDCODED_COLOUR_CLASS = new RegExp(`^${HARDCODED_COLOUR_SOURCE}$`);

/**
 * One class inside a CSS selector — `.text-zinc-600`, or the escaped
 * `.hover\:bg-zinc-500\/15:hover`. The trailing guard keeps `.text-muted` from
 * matching on a prefix of some longer role that happens to start the same way.
 */
export const HARDCODED_COLOUR_SELECTOR = new RegExp(`\\.${HARDCODED_COLOUR_SOURCE}(?![\\w-])`);
