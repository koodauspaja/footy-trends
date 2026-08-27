import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const APP_DIR = path.join(process.cwd(), "src", "app");

/**
 * Pages that render no request-scoped data and are safe to prerender.
 *
 * This list is the whole point of the design. An earlier version asked "does
 * this page import a data module?" and skipped anything that did not match a
 * filename whitelist, so a new page importing a differently-named module would
 * pass unexamined — the failure direction that costs a production outage.
 *
 * Inverted, every page is suspect until named here, and adding a page to this
 * list is a deliberate claim that it touches no per-request data.
 */
const STATIC_BY_DESIGN = new Set([
  "page.tsx",
  path.join("domestic", "page.tsx"),
  path.join("foreign", "page.tsx"),
  path.join("national-teams", "page.tsx"),
  path.join("sentry-example-page", "page.tsx"),
]);

async function pageFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await pageFiles(full)));
    else if (entry.name === "page.tsx") found.push(full);
  }
  return found;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

/**
 * Whether the default-exported component declares a request-scoped prop.
 *
 * Read off the signature rather than searched for in the text: the previous
 * version matched `searchParams` anywhere in the file, and this page's own
 * comment mentioning the word was enough to make the guard skip it.
 */
function takesRequestProps(source: ts.SourceFile): boolean {
  let found = false;

  const visit = (node: ts.Node) => {
    const isDefaultExport =
      (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (isDefaultExport && ts.isFunctionDeclaration(node)) {
      for (const parameter of node.parameters) {
        const text = parameter.getText(source);
        if (/\b(searchParams|params)\b/.test(text)) found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  return found;
}

/**
 * Whether the page opts out of build-time rendering.
 *
 * Only these two do. A positive `revalidate` is still prerendered — it merely
 * re-renders afterwards — so accepting any `revalidate` would let the original
 * bug straight through.
 */
function optsOutOfPrerender(source: ts.SourceFile): boolean {
  let found = false;

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;

    for (const declaration of statement.declarationList.declarations) {
      const name = declaration.name.getText(source);
      const value = declaration.initializer?.getText(source) ?? "";
      if (name === "dynamic" && /^["']force-dynamic["']$/.test(value)) found = true;
      if (name === "revalidate" && value === "0") found = true;
    }
  }

  return found;
}

/**
 * Next prerenders any page it can render without a request. A page reading
 * `searchParams` or `params` cannot be prerendered and is dynamic for free;
 * one taking neither is static unless it says otherwise.
 *
 * That is what broke `/maajoukkueet/huuhkajat` in production (#182). It has no
 * season selector and therefore no `searchParams`, so it was prerendered at
 * build time — where Railway's private network does not exist, because
 * `*.railway.internal` is runtime-only. Every query failed with
 * `ENOTFOUND postgres.railway.internal`, the page rendered its error state,
 * and **that error was baked into the static output** and served to everyone.
 * The build exited 0 and `/api/health` reported the database fine.
 *
 * Helmarit (#167) is the same shape — paramless and data-backed — so this
 * guards the class rather than the one file.
 */
describe("pages are not prerendered unless declared static", () => {
  it("every page takes request props, opts out, or is declared static by design", async () => {
    const offenders: string[] = [];

    for (const file of await pageFiles(APP_DIR)) {
      const relative = path.relative(APP_DIR, file);
      if (STATIC_BY_DESIGN.has(relative)) continue;

      const source = parse(file);
      if (!takesRequestProps(source) && !optsOutOfPrerender(source)) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("reads the signature, not the prose around it", () => {
    const file = path.join(APP_DIR, "national-teams", "mens-team", "page.tsx");
    const source = parse(file);

    // This page's comment mentions `searchParams` while its component takes
    // none. Text matching read that as "dynamic" and skipped the page.
    expect(readFileSync(file, "utf8")).toContain("searchParams");
    expect(takesRequestProps(source)).toBe(false);
    expect(optsOutOfPrerender(source)).toBe(true);
  });

  it("does not accept a revalidate interval as an opt-out", () => {
    const withInterval = ts.createSourceFile(
      "x.tsx",
      "export const revalidate = 900;",
      ts.ScriptTarget.Latest,
      true
    );
    const withZero = ts.createSourceFile(
      "x.tsx",
      "export const revalidate = 0;",
      ts.ScriptTarget.Latest,
      true
    );

    expect(optsOutOfPrerender(withInterval)).toBe(false);
    expect(optsOutOfPrerender(withZero)).toBe(true);
  });

  it("recognises a page that genuinely takes request props", () => {
    const source = parse(path.join(APP_DIR, "national-teams", "standings", "page.tsx"));

    expect(takesRequestProps(source)).toBe(true);
  });
});
