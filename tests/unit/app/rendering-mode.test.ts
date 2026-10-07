import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Which pages Next may prerender: a page is static only if named in `STATIC_BY_DESIGN`,
 * and a named page takes no request props, reaches no request state and opts out of
 * nothing. That a page really is prerendered is for the build's route table to prove.
 *
 * decisions/182-national-team-pages-not-prerendered.md
 * decisions/018-helmarit.md
 * decisions/028-admin-tools-and-roles.md
 * decisions/264-sign-up-beyond-test-users.md
 * decisions/302-privacy-policy-and-footer.md
 * decisions/303-terms-and-attribution.md
 */

const APP_DIR = path.join(process.cwd(), "src", "app");

// Pages that render no request-scoped data and are safe to prerender. Every
// page is suspect until named here, so adding one is a deliberate claim that it
// touches no per-request data.
const STATIC_BY_DESIGN = new Set([
  "page.tsx",
  path.join("domestic", "page.tsx"),
  path.join("foreign", "page.tsx"),
  path.join("national-teams", "page.tsx"),
  // The privacy policy. Static by design and by requirement: Google needs it
  // reachable without signing in before the OAuth consent screen can leave
  // Testing, so it must never start reading a session.
  path.join("privacy", "page.tsx"),
  // The terms of service, for the same reason as the policy above.
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

// Whether the default-exported component declares a request-scoped prop. Read
// off the signature, not searched for in the text: a comment that mentions
// `searchParams` must not count.
function takesRequestProps(source: ts.SourceFile): boolean {
  // Any parameter at all: a Next page component is called with one prop object
  // whose only members are `params` and `searchParams`, so
  // `function Page(props)` is request-dependent whatever it calls it.
  const declaresRequestProp = (parameters: readonly ts.ParameterDeclaration[]) =>
    parameters.length > 0;

  // Any callable, however it was written.
  const isCallable = (
    node: ts.Node
  ): node is ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression =>
    ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);

  // Named callables in the file, so `export default Page` can be followed back
  // to its declaration: both `function Page()` and `const Page = () => {}` land
  // here.
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

// Whether the page opts out of build-time rendering. Only these two do: a
// positive `revalidate` is still prerendered, and merely re-renders afterwards.
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

// Every module a file pulls in. `await import("…")` counts: the repository uses
// it to keep `@/lib/auth` off an import path. `import type` does not: it is
// erased at compile time, and a false alarm is what gets a guard deleted.
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
      // `export { type Foo } from "./m"` is erased too, and marks its type-only
      // ness per element rather than on the statement.
      const clause = statement.exportClause;
      const allTypes =
        clause !== undefined &&
        ts.isNamedExports(clause) &&
        clause.elements.every((element) => element.isTypeOnly);
      if (!allTypes) found.push(statement.moduleSpecifier.text);
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

// A first-party import resolved to a file on disk, or null. Only `@/lib/x` and
// `./x` are resolved: a bare specifier is a package, which cannot make a page
// dynamic without one of our files importing it first.
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

// Whether a module is a server action's. The walk below stops at one, and that
// is not an exemption: reached from a client component it is a network stub at
// build time, so what it imports cannot change the page's rendering mode.
function isServerActionModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}

// Whether a page reaches request-scoped state through any of its own modules.
// `headers()`, `cookies()` and `draftMode()` opt a page out by being called, wherever
// that is, so first-party imports are followed, as far as a server action's module.
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
  // The other half of `STATIC_BY_DESIGN`: the check below skips every file on the list, so alone
  // the list exempts and does not guarantee. A declared-static page takes no request props and opts
  // out of nothing, which matters most for the two pages Google requires reachable signed out.
  it.each([...STATIC_BY_DESIGN])("%s neither takes request props nor opts out", (relative) => {
    const source = parse(path.join(APP_DIR, relative));

    expect(takesRequestProps(source)).toBe(false);
    expect(optsOutOfPrerender(source)).toBe(false);
    // `headers()` opts a page out by being called, so there is no export to
    // look for, and it need not be called in the page file.
    expect(reachesRequestState(path.join(APP_DIR, relative))).toBeNull();
  });
});

// Next prerenders any page it can render without a request. One taking neither
// `searchParams` nor `params` is static unless it says otherwise, and at build time
// Railway's private network does not exist: its error state would be baked into the output.
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

  it("keeps the admin page dynamic, because a build artefact would leak emails", () => {
    // Asserted by name, although the sweep above would catch it: a prerendered
    // `/yllapito` is a static file listing every user.
    const source = parse(path.join(APP_DIR, "admin", "page.tsx"));

    expect(optsOutOfPrerender(source)).toBe(true);
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
