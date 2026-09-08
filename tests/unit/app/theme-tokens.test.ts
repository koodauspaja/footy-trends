import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { HARDCODED_COLOUR_CLASS } from "../../shared/hardcoded-colour";

const SRC_DIR = path.join(process.cwd(), "src");

/** `hover:bg-surface` is a variant of `bg-surface`; the rule is about the utility. */
function withoutVariants(className: string): string {
  return className.slice(className.lastIndexOf(":") + 1);
}

/**
 * Every hardcoded colour any string in one file could contribute as a class.
 *
 * **Every** string literal, not only the initializer of a `className`
 * attribute. A component that factors its classes into a constant —
 * `const PANEL = "bg-zinc-50"`, rendered as `className={PANEL}` — puts the
 * shade one hop away from the attribute, and a scan that followed only the
 * attribute would report the file clean. Nothing else in `src` writes a string
 * shaped like a painting utility, so widening the net costs nothing and closes
 * every indirection at once: constants, `clsx` arguments, ternaries, maps.
 *
 * Read off the AST rather than grepped, for the reason `rendering-mode.test.ts`
 * parses too: a text search reads prose as code. The account menu's comment
 * quotes `bg-white` while explaining why the panel must not use it, and a grep
 * would have to be taught to ignore the very sentence that documents the rule.
 */
function hardcodedColoursIn(source: string, fileName = "snippet.tsx"): string[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.push(...node.text.split(/\s+/));
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push(...node.text.split(/\s+/));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);

  return found.filter((name) => name !== "" && HARDCODED_COLOUR_CLASS.test(withoutVariants(name)));
}

/** Every class name any string in one file could contribute, offending or not. */
function classNamesIn(source: string): string[] {
  const parsed = ts.createSourceFile("scan.tsx", source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.push(...node.text.split(/\s+/));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) found.push(full);
  }
  return found;
}

describe("theme tokens", () => {
  /**
   * The guard #269 asked for, at the source rather than at the pixel.
   *
   * `tests/e2e/dark-mode.spec.ts` measures what is painted, which is the
   * stronger check — but only on the pages and states it visits. A component
   * added to a page nobody thought to add there would keep its shade
   * indefinitely. This one cannot be outrun that way: every `.ts` and `.tsx`
   * under `src` is read, so a new file is covered by existing.
   */
  it("names a role in every class the app writes, never a shade", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC_DIR)) {
      for (const colour of hardcodedColoursIn(readFileSync(file, "utf8"), file)) {
        offenders.push(`${path.relative(process.cwd(), file)}: ${colour}`);
      }
    }

    expect(
      offenders,
      `Hardcoded colours cannot follow the theme. Use a role from src/app/globals.css:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("reads classes the app really has, so an empty scan cannot pass vacuously", async () => {
    const files = await sourceFiles(SRC_DIR);
    const classes = files.flatMap((file) => classNamesIn(readFileSync(file, "utf8")));

    expect(files.length).toBeGreaterThan(20);
    // The roles the app was converted to. If these stopped being found, the
    // scan above would be reporting on nothing.
    expect(classes).toContain("text-muted");
    expect(classes).toContain("border-border");
    expect(classes).toContain("hover:bg-surface");
  });

  /**
   * The rule itself, driven through the same function the scan uses. A clean
   * repository proves the rule matched nothing today; these prove it would
   * have matched something.
   */
  describe("catches a shade", () => {
    it.each([
      ["written straight into the attribute", '<div className="bg-white" />'],
      ["with a numeric shade", '<div className="text-zinc-600" />'],
      // The class the account menu actually carried before #269.
      ["with an opacity modifier", '<div className="hover:bg-zinc-500/15" />'],
      ["with an arbitrary opacity", '<div className="border-zinc-500/[0.4]" />'],
      ["as a literal colour", '<div className="bg-[#fafafa]" />'],
      ["as a literal colour with opacity", '<div className="bg-[#fafafa]/50" />'],
      ["behind a variant", '<div className="disabled:text-gray-400" />'],
      // The indirections a scan of `className` alone would walk straight past.
      ["one hop away in a constant", 'const PANEL = "bg-zinc-50";\n<div className={PANEL} />'],
      ["inside a helper call", '<div className={clsx("rounded", "bg-amber-50")} />'],
      [
        "inside a template literal",
        ["<div className={`rounded ", "{x} bg-slate-100`} />"].join("$"),
      ],
      ["in a lookup table", 'const BY_STATE = { open: "text-emerald-600" };'],
    ])("%s", (_case, source) => {
      expect(hardcodedColoursIn(source)).not.toEqual([]);
    });
  });

  describe("leaves alone", () => {
    it.each([
      ["a role", '<div className="bg-surface text-muted border-border-subtle" />'],
      ["a role with a variant", '<div className="hover:bg-surface" />'],
      ["a utility that paints nothing", '<div className="disabled:opacity-50 hover:underline" />'],
      // The comment that documents the rule quotes the class it forbids.
      [
        "the sentence explaining the rule",
        "// bg-background text-foreground, not bg-white\n<div />",
      ],
      ["Finnish prose", "<p>Kirjaudu sisään nähdäksesi asetuksesi.</p>"],
    ])("%s", (_case, source) => {
      expect(hardcodedColoursIn(source)).toEqual([]);
    });
  });
});
