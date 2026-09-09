import { existsSync, readFileSync } from "node:fs";
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
  const declaresRequestProp = (parameters: readonly ts.ParameterDeclaration[]) =>
    parameters.some((parameter) => /\b(searchParams|params)\b/.test(parameter.getText(source)));

  /** Any callable, however it was written. */
  const isCallable = (
    node: ts.Node
  ): node is ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression =>
    ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);

  /**
   * Named callables in the file, so `export default Page` can be followed back
   * to the declaration it names. Both `function Page()` and
   * `const Page = () => {}` land here.
   */
  const byName = new Map<string, readonly ts.ParameterDeclaration[]>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      byName.set(statement.name.text, statement.parameters);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer = declaration.initializer;
        if (initializer && isCallable(initializer) && ts.isIdentifier(declaration.name)) {
          byName.set(declaration.name.text, initializer.parameters);
        }
      }
    }
  }

  for (const statement of source.statements) {
    // `export default function Page({ searchParams })` and
    // `export default async function Page(...)`.
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) &&
      declaresRequestProp(statement.parameters)
    ) {
      return true;
    }

    if (!ts.isExportAssignment(statement) || statement.isExportEquals) continue;

    // `export default ({ params }) => …` and `export default function (…) {}`.
    const expression = statement.expression;
    if (isCallable(expression) && declaresRequestProp(expression.parameters)) return true;

    // `export default Page`, where `Page` is declared above.
    if (ts.isIdentifier(expression)) {
      const parameters = byName.get(expression.text);
      if (parameters && declaresRequestProp(parameters)) return true;
    }
  }

  return false;
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
/**
 * Every module a file pulls in — static and dynamic alike.
 *
 * `await import("…")` counts. This repository uses it deliberately to keep
 * `@/lib/auth` off a module's import path (`current-user.ts`, `viewer.ts`), so
 * a walk that only read `import` declarations would miss exactly the pattern
 * the codebase reaches for when it wants an import not to happen eagerly.
 *
 * **`import type` does not count.** It is erased at compile time, so it creates
 * no runtime dependency and cannot make a page dynamic. Counting it would fail
 * a page that is genuinely static — a false alarm, which is the worse kind for
 * a guard: the true one gets investigated, the false one gets the guard
 * deleted. `current-user.ts` imports `@/lib/auth` exactly this way.
 */
function moduleSpecifiers(source: ts.SourceFile): string[] {
  const found: string[] = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      // `import type X from` and `import { type X }` alike: erased, so not a
      // dependency. A bare `import "…"` has no clause and is a real side effect.
      const typeOnly =
        clause?.isTypeOnly === true ||
        (clause?.namedBindings !== undefined &&
          ts.isNamedImports(clause.namedBindings) &&
          clause.namedBindings.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) found.push(statement.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(statement) &&
      !statement.isTypeOnly &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      found.push(statement.moduleSpecifier.text);
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      const [argument] = node.arguments;
      // A computed specifier cannot be resolved statically, and this repository
      // has none — every dynamic import here names a literal module.
      if (argument !== undefined && ts.isStringLiteral(argument)) found.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  return found;
}

const SRC_DIR = path.join(process.cwd(), "src");
const EXTENSIONS = [".ts", ".tsx"];

/**
 * A first-party import resolved to a file on disk, or null when it is not one.
 *
 * Handles the two forms this repository uses — `@/lib/x` and `./x` — and
 * deliberately resolves nothing else. A bare specifier is a package, and a
 * package cannot make one of our pages dynamic without one of our files
 * importing it first.
 */
function resolveFirstParty(specifier: string, importer: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(SRC_DIR, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(importer), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [
    ...EXTENSIONS.map((extension) => `${base}${extension}`),
    ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether a page reaches `next/headers` through *any* of its own modules.
 *
 * Checking the page's own imports was not enough, and review said so four
 * times before I stopped arguing and wrote this: `headers()` makes a page
 * dynamic wherever it is called, so a one-line helper is enough to hide it.
 *
 * Only first-party files are followed, so the walk is small and terminates on
 * the first package boundary. Cycles are handled by the visited set.
 *
 * **It stops at `"use server"` modules, and that is not an exemption.** A server
 * action reached from a client component is replaced by a network stub at build
 * time — the page never runs its body, so what it imports cannot change the
 * page's rendering mode. Without this the walk reports every page carrying a
 * favourite star, via
 * `favourite-toggle.tsx → favourite-actions.ts → current-user.ts`, and the
 * build disagrees: all three are `○ (Static)`.
 */
function isServerActionModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

function reachesRequestState(entry: string): string | null {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);

    const source = parse(file);
    // The entry page itself is never a server action, so this only ever prunes
    // a module reached through one.
    if (file !== entry && isServerActionModule(source)) continue;

    for (const specifier of moduleSpecifiers(source)) {
      if (specifier === "next/headers") return path.relative(process.cwd(), file);
      const resolved = resolveFirstParty(specifier, file);
      if (resolved !== null) queue.push(resolved);
    }
  }

  return null;
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
   * **Both gaps review found are closed.** It follows the page's own
   * first-party imports rather than reading one file, so a helper cannot hide a
   * `headers()` call; and `takesRequestProps` handles every default-export form
   * — declaration, arrow function, function expression, and
   * `export default Name` followed back to its declaration. Each is
   * mutation-checked.
   *
   * **Three checks, three different properties** — worth separating, because
   * describing the end-to-end one as simply "stronger" overstates it:
   *
   * | Check | What it actually proves |
   * |---|---|
   * | this test | nothing the page declares *or imports* makes it dynamic |
   * | `npm run build`'s route table | the page really is prerendered (`○`) |
   * | `privacy.spec.ts` / `terms.spec.ts` | it is **reachable signed out**, with JavaScript blocked |
   *
   * The e2e specs do *not* prove the page is static — a server-rendered page
   * returns HTML without JavaScript too. They prove the property Google's
   * requirement is about, which is reachability rather than rendering mode.
   */
  it.each([...STATIC_BY_DESIGN])("%s neither takes request props nor opts out", (relative) => {
    const source = parse(path.join(APP_DIR, relative));

    expect(takesRequestProps(source)).toBe(false);
    expect(optsOutOfPrerender(source)).toBe(false);
    /**
     * `headers()` opts a page out by being *called*, so there is no export to
     * look for — and it need not be called in the page file. This follows the
     * page's own first-party imports to the end, so a helper cannot hide it.
     */
    expect(reachesRequestState(path.join(APP_DIR, relative))).toBeNull();
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
