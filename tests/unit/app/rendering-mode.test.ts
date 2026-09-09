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
  // The privacy policy (#302). Static by design *and* by requirement: Google
  // needs it reachable without signing in before the OAuth consent screen can
  // leave Testing, so it must never start reading a session.
  path.join("privacy", "page.tsx"),
  // The terms of service (#303), for the same reason as the policy above.
  path.join("terms", "page.tsx"),
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
/**
 * Whether a page imports request-scoped state.
 *
 * `headers()`, `cookies()` and `draftMode()` each opt a page out of
 * prerendering **by being called** — no `force-dynamic` export appears, so
 * checking for one misses this entirely. It is also the exact shape of the
 * failure that matters here: reading a session is how a page meant to be
 * readable signed out stops being prerendered.
 */
function importsRequestState(source: ts.SourceFile): boolean {
  return source.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "next/headers"
  );
}

describe("a page declared static by design really is static", () => {
  /**
   * The other half of `STATIC_BY_DESIGN`, and the one that was missing.
   *
   * The check below *skips* every file on that list, so the list on its own
   * exempts rather than guarantees: a page could join it and then quietly start
   * reading a session or a search param, and nothing would say so. That matters
   * most for the two pages Google requires reachable **without signing in** —
   * `/tietosuoja` and `/kayttoehdot` — where becoming dynamic is not a
   * performance regression but a broken legal requirement (#264, #302, #303).
   *
   * Asserting the inverse turns the list into a promise: a declared-static page
   * takes no request props and opts out of nothing.
   *
   * **What it does not catch, deliberately.** It reads one file's syntax, so a
   * page calling a *helper* that imports `next/headers` still slips past, and
   * `takesRequestProps` only inspects a default-exported function declaration.
   * Closing either means resolving the import graph — a great deal of machinery
   * for a list of six files edited by hand, and machinery whose own correctness
   * would then need testing.
   *
   * The cases it does catch are the ones a person actually writes. The
   * end-to-end check is elsewhere and stronger: `tests/e2e/privacy.spec.ts` and
   * `terms.spec.ts` load both pages **with JavaScript blocked** and signed out,
   * which is the property Google's requirement is about and which no static
   * analysis can substitute for.
   */
  it.each([...STATIC_BY_DESIGN])("%s neither takes request props nor opts out", (relative) => {
    const source = parse(path.join(APP_DIR, relative));

    expect(takesRequestProps(source)).toBe(false);
    expect(optsOutOfPrerender(source)).toBe(false);
    // The one that has no export to look for: `headers()` opts the page out by
    // being called.
    expect(importsRequestState(source)).toBe(false);
  });
});

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
