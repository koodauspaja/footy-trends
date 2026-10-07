import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { HARDCODED_COLOUR_CLASS, paintsWithShade } from "../../shared/hardcoded-colour";

/**
 * No class the app writes names a shade: every colour is a role that follows
 * the theme.
 *
 * decisions/269-colour-roles.md
 */

const SRC_DIR = path.join(process.cwd(), "src");

// `hover:bg-surface` is a variant of `bg-surface`; the rule is about the
// utility. A utility never contains a colon, so the last one always ends the
// variants, an arbitrary variant like `supports-[display:grid]:` included.
function withoutVariants(className: string): string {
  return className.slice(className.lastIndexOf(":") + 1);
}

// Every hardcoded colour any string in one file could contribute as a class. Every string literal,
// not only a `className` initializer: a class in a constant sits one hop away, and nothing else in
// `src` is shaped like a painting utility. Read off the AST: a text search reads prose as code.
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

// Every class name any string in one file could contribute, offending or not.
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
  // The guard at the source, not at the pixel. `tests/e2e/dark-mode.spec.ts`
  // measures what is painted, but only on the pages and states it visits; this
  // reads every `.ts` and `.tsx` under `src`, so a new file is covered by existing.
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

  // The rule itself, driven through the same function the scan uses. A clean
  // repository proves the rule matched nothing today; these prove it would have
  // matched something.
  describe("catches a shade", () => {
    it.each([
      ["written straight into the attribute", '<div className="bg-white" />'],
      ["with a numeric shade", '<div className="text-zinc-600" />'],
      // The class the account menu carried.
      ["with an opacity modifier", '<div className="hover:bg-zinc-500/15" />'],
      ["with an arbitrary opacity", '<div className="border-zinc-500/[0.4]" />'],
      ["as a literal colour", '<div className="bg-[#fafafa]" />'],
      ["as a literal colour with opacity", '<div className="bg-[#fafafa]/50" />'],
      ["behind a variant", '<div className="disabled:text-gray-400" />'],
      ["behind an arbitrary variant", '<div className="data-[state=open]:bg-zinc-500" />'],
      ["behind a selector variant", '<div className="[&>svg]:text-red-500" />'],
      ["marked important, v4 style", '<div className="bg-zinc-500!" />'],
      ["marked important, v3 style", '<div className="!bg-zinc-500" />'],
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

  // The selector half of the same rule, which `tests/e2e/dark-mode.spec.ts` applies to the served
  // stylesheet. Tailwind writes `hover:bg-zinc-500/15` as `.hover\:bg-zinc-500\/15:hover`, with the
  // dot before `hover`, so the variant prefix has to be allowed for.
  describe("in a stylesheet selector", () => {
    it.each([
      [".text-zinc-600"],
      [".bg-\\[\\#fafafa\\]"],
      [".bg-\\[\\#fafafa\\]\\/50"],
      [".hover\\:bg-zinc-500\\/15:hover"],
      [".disabled\\:text-gray-400:disabled"],
      [".dark\\:bg-slate-100"],
      [".sm\\:hover\\:border-zinc-200:hover"],
      // These four are copied from a build, not written by hand: each was put into a
      // component, `npm run build` run, and the selector read out of the emitted CSS. A
      // guessed fixture proves only that the guard matches what its author imagined.
      [".data-\\[state\\=open\\]\\:bg-zinc-500[data-state=open]"],
      [".\\[\\&\\>svg\\]\\:text-red-500>svg"],
      [".bg-zinc-500\\!"],
      [".\\!bg-fuchsia-500"],
    ])("catches %s", (selector) => {
      expect(paintsWithShade(selector)).toBe(true);
    });

    it.each([
      [".text-muted"],
      [".bg-surface"],
      [".border-border-subtle"],
      [".hover\\:bg-surface:hover"],
      [".text-notice-foreground"],
      [".disabled\\:opacity-50:disabled"],
      // A role whose name merely starts like a shade's would be a false
      // positive; the trailing guard is what stops it.
      [".text-redacted"],
    ])("leaves %s alone", (selector) => {
      expect(paintsWithShade(selector)).toBe(false);
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
