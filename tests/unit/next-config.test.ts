import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../next.config";

/**
 * Public URLs are Finnish and the App Router folders are English: a rewrite takes each URL to
 * its folder, and a redirect takes the folder's own path back, because a rewrite does not block
 * its target. This compares what `next.config.ts` returns, whatever the lists are built from.
 *
 * decisions/527-one-route-table.md
 * decisions/012-finnish-urls-english-code.md
 */

type Rewrite = { source: string; destination: string };
type Redirect = Rewrite & { permanent?: boolean };

async function evaluated(): Promise<{ rewrites: Rewrite[]; redirects: Redirect[] }> {
  const rewrites = (await config.rewrites?.()) as Rewrite[];
  const redirects = (await config.redirects?.()) as Redirect[];
  return {
    // Sentry adds its tunnel to another host, which is not a page.
    rewrites: rewrites.filter((rewrite) => rewrite.destination.startsWith("/")),
    redirects,
  };
}

// Every `page.tsx` under `src/app` but the home page, as the path its folder
// answers on.
function pageFolders(directory = path.join(process.cwd(), "src", "app"), prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      const segment = entry.name.replace(/^\[(.+)\]$/, ":$1");
      return pageFolders(path.join(directory, entry.name), `${prefix}/${segment}`);
    }
    return entry.name === "page.tsx" && prefix !== "" ? [prefix] : [];
  });
}

describe("next.config.ts, Finnish URLs over English folders", () => {
  it("redirects every rewrite target to the URL that reaches it, permanently", async () => {
    const { rewrites, redirects } = await evaluated();

    expect(rewrites.length).toBeGreaterThan(0);
    for (const { source, destination } of rewrites) {
      expect(redirects, destination).toContainEqual({
        source: destination,
        destination: source,
        permanent: true,
      });
    }
  });

  it("gives every page folder a Finnish URL, and rewrites to nothing that is not a page", async () => {
    const { rewrites } = await evaluated();

    expect(rewrites.map((rewrite) => rewrite.destination).sort()).toEqual(pageFolders().sort());
  });

  it("redirects only to a URL that is rewritten, and never away from one", async () => {
    const { rewrites, redirects } = await evaluated();
    const urls = rewrites.map((rewrite) => rewrite.source);

    for (const { source, destination } of redirects) {
      expect(urls, `${source} → ${destination}`).toContain(destination);
      expect(urls, source).not.toContain(source);
    }
  });

  it("has one redirect for a path, so none shadows another", async () => {
    const { redirects } = await evaluated();
    const sources = redirects.map((redirect) => redirect.source);

    expect(sources).toEqual([...new Set(sources)]);
  });

  // The eight folders that had the rewrite alone.
  it.each([
    ["/national-teams/mens-team", "/maajoukkueet/huuhkajat"],
    ["/national-teams/womens-team", "/maajoukkueet/helmarit"],
    ["/domestic/head-to-head/:a/:b", "/kotimaa/kohtaamiset/:a/:b"],
    ["/foreign/head-to-head/:a/:b", "/ulkomaat/kohtaamiset/:a/:b"],
    ["/national-teams/head-to-head/:a/:b", "/maajoukkueet/kohtaamiset/:a/:b"],
    ["/national-teams/mens-team/head-to-head/:a/:b", "/maajoukkueet/huuhkajat/kohtaamiset/:a/:b"],
    ["/national-teams/womens-team/head-to-head/:a/:b", "/maajoukkueet/helmarit/kohtaamiset/:a/:b"],
    ["/predictions", "/ennusteet"],
  ])("redirects %s to %s", async (source, destination) => {
    const { redirects } = await evaluated();

    expect(redirects).toContainEqual({ source, destination, permanent: true });
  });
});
