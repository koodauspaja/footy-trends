import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "@/app/layout";

/**
 * `next/font/google` fetches and subsets fonts at build time, which cannot run
 * here. The variables it returns are what the layout actually uses.
 */
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

/**
 * `SiteHeader` reads the path to decide its region crumb. Rendering the layout
 * in isolation gives it no router to read from, so the hook is stood in for
 * here; what the crumb does with a path is covered in the header's own tests.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("RootLayout", () => {
  it("declares the document Finnish, which the whole app assumes", () => {
    const markup = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);

    expect(markup).toContain('lang="fi"');
  });

  it("renders the site header above the page", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>Sivun sisältö</p>
      </RootLayout>
    );

    expect(markup).toContain("Etusivu");
    expect(markup.indexOf("Etusivu")).toBeLessThan(markup.indexOf("Sivun sisältö"));
  });

  it("carries both font variables onto the document element", () => {
    const markup = renderToStaticMarkup(<RootLayout>{null}</RootLayout>);

    expect(markup).toContain("--font-geist-sans");
    expect(markup).toContain("--font-geist-mono");
  });

  it("titles and describes the app in Finnish", () => {
    expect(metadata.title).toBe("Sarjataulukko");
    expect(metadata.description).toBe("Jalkapallon sarjataulukot ja ottelut.");
  });
});
