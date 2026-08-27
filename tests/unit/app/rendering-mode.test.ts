import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = path.join(process.cwd(), "src", "app");

/** Modules that reach a database or a provider, rather than rendering constants. */
const DATA_IMPORT = /from "@\/(db|lib\/[a-z-]*(service|football-data|taso|page-context))/;

/**
 * Comments are stripped before anything is matched. Without this the checks
 * read prose: this very page's comment explains that other pages take
 * `searchParams`, which was enough to make the guard skip it — so the guard
 * was passing on the page it exists to protect.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

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

/**
 * Next prerenders any page it can render without a request. A page that reads
 * `searchParams` or `params` cannot be prerendered and is dynamic for free;
 * one that takes neither is static unless it says otherwise.
 *
 * That is what broke `/maajoukkueet/huuhkajat` in production (#182). It has no
 * season selector and therefore no `searchParams`, so it was prerendered at
 * build time — where Railway's private network does not exist, because
 * `*.railway.internal` is runtime-only. Every query failed with
 * `ENOTFOUND postgres.railway.internal`, the page rendered its error state,
 * and **that error was baked into the static output** and served to every
 * visitor. The build exited 0 and `/api/health` reported everything fine.
 *
 * Helmarit (#167) is the same shape — a paramless, data-backed page — so this
 * is a guard on the class rather than on the one file.
 */
describe("data-backed pages are never prerendered", () => {
  it("each one either takes request params or opts out of static rendering", async () => {
    const offenders: string[] = [];

    for (const file of await pageFiles(APP_DIR)) {
      const source = withoutComments(readFileSync(file, "utf8"));
      if (!DATA_IMPORT.test(source)) continue;

      const takesRequestInput = /\b(searchParams|params)\b/.test(source);
      // Only these two actually keep a page out of the build. `revalidate` with
      // a positive interval is still prerendered — it just re-renders later —
      // so accepting any `revalidate` would let the original bug through.
      const optsOut =
        /export const dynamic\s*=\s*"force-dynamic"/.test(source) ||
        /export const revalidate\s*=\s*0\b/.test(source);
      if (!takesRequestInput && !optsOut) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it("recognises a paramless data page that has opted out", async () => {
    const source = withoutComments(
      readFileSync(path.join(APP_DIR, "national-teams", "mens-team", "page.tsx"), "utf8")
    );

    // Guards the guard: if this page stopped matching DATA_IMPORT, or started
    // mentioning request params anywhere, the check above would pass by simply
    // not looking at it.
    expect(DATA_IMPORT.test(source)).toBe(true);
    expect(/\b(searchParams|params)\b/.test(source)).toBe(false);
    expect(/export const dynamic\s*=\s*"force-dynamic"/.test(source)).toBe(true);
  });
});
