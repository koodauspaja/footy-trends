import { expect, type Page, test } from "@playwright/test";

/**
 * Every rendered string, measured against what is actually painted behind it,
 * in both colour schemes.
 *
 * This exists because #273 shipped: the account menu pinned a white surface
 * while its text followed the theme, reaching 1.17:1 in dark mode. Light mode
 * looked fine, which is exactly why it got through — and 23 files carried the
 * same class of problem (#269).
 *
 * jsdom has neither layout nor computed colours, so this can only be a browser
 * test. It walks the page rather than naming elements, so a component added
 * later is covered without anyone remembering to add it here.
 */
const AA_NORMAL_TEXT = 4.5;

/** Pages chosen for the roles they render, not for their data. */
const PAGES = [
  ["the region picker", "/"],
  ["a standings table", "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026"],
  ["a match list", "/ulkomaat/ottelut?kilpailu=PL"],
  // Renders the amber fallback banner, which has its own three tokens.
  ["a fallback notice", "/kotimaa/sarjataulukko?kilpailu=NOPE"],
] as const;

type Offender = { text: string; contrast: number; colour: string; behind: string };

async function lowContrastText(page: Page): Promise<Offender[]> {
  return page.evaluate((threshold) => {
    const toRgb = (css: string): [number, number, number] | null => {
      const context = document.createElement("canvas").getContext("2d");
      if (context === null) return null;
      context.fillStyle = "#000000";
      context.fillStyle = css;
      const hex = context.fillStyle as string;
      if (!hex.startsWith("#")) return null;
      return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
    };

    const luminance = ([r, g, b]: [number, number, number]) => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    /** The first ancestor that actually paints something. */
    const backgroundBehind = (element: Element): string => {
      let node: Element | null = element;
      while (node !== null) {
        const colour = getComputedStyle(node).backgroundColor;
        if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") return colour;
        node = node.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };

    const offenders: Offender[] = [];

    for (const element of document.querySelectorAll("body *")) {
      // Only elements holding text of their own — a container's colour says
      // nothing about what is drawn.
      const own = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      if (own === "") continue;

      // Decorative content is exempt by definition — the breadcrumb separator
      // is `aria-hidden`, and a screen reader never announces it.
      if (element.closest('[aria-hidden="true"]') !== null) continue;

      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (element.getBoundingClientRect().height === 0) continue;

      const colour = style.color;
      const behind = backgroundBehind(element);
      const [fg, bg] = [toRgb(colour), toRgb(behind)];
      if (fg === null || bg === null) continue;

      const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      const contrast = ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);

      if (contrast < threshold) {
        offenders.push({
          text: own.slice(0, 40),
          contrast: Number(contrast.toFixed(2)),
          colour,
          behind,
        });
      }
    }

    return offenders;
  }, AA_NORMAL_TEXT);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Colour scheme: ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const [description, path] of PAGES) {
      test(`${description} is legible throughout`, async ({ page }) => {
        await page.goto(path);
        // Something rendered, so an empty page cannot pass vacuously.
        await expect(page.getByRole("heading").first()).toBeVisible();

        const offenders = await lowContrastText(page);

        expect(
          offenders,
          `Text below ${AA_NORMAL_TEXT}:1 in ${scheme} mode on ${path}:\n${JSON.stringify(offenders, null, 2)}`
        ).toEqual([]);
      });
    }
  });
}
