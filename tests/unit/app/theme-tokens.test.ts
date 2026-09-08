import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.join(process.cwd(), "src");

/**
 * Tailwind's own palette, plus the two absolutes. A class naming any of these
 * is naming a *shade*, which cannot know what is painted behind it — the whole
 * failure #269 describes, where 23 files kept painting for a white page after
 * the page turned near-black.
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
 * Any utility that paints, followed by a shade or by a literal colour in
 * square brackets. `bg-surface` and `text-muted` are roles and pass; `bg-white`
 * and `text-zinc-600` are shades and do not, and neither does `bg-[#fafafa]`,
 * which is the same mistake written to evade a palette check.
 */
const PAINTING_UTILITY =
  "(?:bg|text|border|ring|divide|outline|decoration|shadow|from|via|to|caret|accent|fill|stroke|placeholder)";
const HARDCODED_COLOUR = new RegExp(
  `^${PAINTING_UTILITY}-(?:(?:${SHADES.join("|")})(?:-\\d{2,3})?|\\[(?:#|rgb|hsl|oklch|lab)[^\\]]*\\])$`
);

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/**
 * Every class name any `className` attribute can produce in one file.
 *
 * Read off the AST rather than grepped, for the reason the same decision was
 * made in `rendering-mode.test.ts`: a text search reads prose as code. The
 * comment on the account menu panel quotes `bg-white` while explaining why the
 * panel must not use it, and a grep-based guard would have to be taught to
 * ignore exactly the sentence that documents the rule.
 */
function classNamesIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true
  );
  const classes: string[] = [];

  const collectStrings = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      classes.push(...node.text.split(/\s+/));
    } else if (ts.isTemplateExpression(node)) {
      classes.push(...node.head.text.split(/\s+/));
      for (const span of node.templateSpans) classes.push(...span.literal.text.split(/\s+/));
    }
    ts.forEachChild(node, collectStrings);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "className" && node.initializer) {
      collectStrings(node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return classes.filter((name) => name !== "");
}

/** `hover:bg-surface` is a variant of `bg-surface`; the rule is about the utility. */
function withoutVariants(className: string): string {
  return className.slice(className.lastIndexOf(":") + 1);
}

describe("theme tokens", () => {
  /**
   * The guard #269 asked for, at the source rather than at the pixel.
   *
   * `tests/e2e/dark-mode.spec.ts` measures what is painted, which is the
   * stronger check — but only on the pages and states it visits. A component
   * added to a page nobody thought to add there would keep its shade
   * indefinitely. This one cannot be outrun that way: every `.tsx` under `src`
   * is read, so a new file is covered by existing.
   */
  it("names a role in every className, never a shade", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC_DIR)) {
      for (const className of classNamesIn(file)) {
        if (HARDCODED_COLOUR.test(withoutVariants(className))) {
          offenders.push(`${path.relative(process.cwd(), file)}: ${className}`);
        }
      }
    }

    expect(
      offenders,
      `Hardcoded colours cannot follow the theme. Use a role from src/app/globals.css:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("reads classes the app really has, so an empty scan cannot pass vacuously", async () => {
    const files = await sourceFiles(SRC_DIR);
    const classes = files.flatMap((file) => classNamesIn(file));

    expect(files.length).toBeGreaterThan(20);
    // The roles the app was converted to. If these stopped being found, the
    // scan above would be reporting on nothing.
    expect(classes).toContain("text-muted");
    expect(classes).toContain("border-border");
    expect(classes).toContain("hover:bg-surface");
  });

  it("would catch a shade, a literal colour and a variant of either", () => {
    // The rule itself, checked directly — the scan above can only prove the
    // repository is clean today, not that the pattern recognises anything.
    for (const shade of ["bg-white", "text-zinc-600", "border-amber-200", "bg-[#fafafa]"]) {
      expect(HARDCODED_COLOUR.test(withoutVariants(shade)), shade).toBe(true);
    }
    expect(HARDCODED_COLOUR.test(withoutVariants("hover:bg-zinc-50"))).toBe(true);

    for (const role of ["bg-surface", "text-muted", "border-border-subtle", "bg-background"]) {
      expect(HARDCODED_COLOUR.test(withoutVariants(role)), role).toBe(false);
    }
    // Not a colour at all, and the app uses both.
    expect(HARDCODED_COLOUR.test(withoutVariants("hover:underline"))).toBe(false);
    expect(HARDCODED_COLOUR.test(withoutVariants("disabled:opacity-50"))).toBe(false);
  });
});
