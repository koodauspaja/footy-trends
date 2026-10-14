import { expect, type Page, test } from "@playwright/test";
import { paintsWithShade } from "../shared/hardcoded-colour";
import { openAccountMenu, signedInAs } from "./session";

/**
 * Every rendered string, measured against what is painted behind it, in both colour
 * schemes. jsdom has neither layout nor computed colours, so only a browser can. It
 * walks the page, so a component added later is covered without being named.
 *
 * decisions/269-colour-roles.md
 */

const AA_NORMAL_TEXT = 4.5;

// Pages chosen for the roles they render, not for their data.
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

    // One colour laid over another at `alpha`, which is what the GPU does.
    const over = (
      top: [number, number, number],
      alpha: number,
      bottom: [number, number, number]
    ): [number, number, number] =>
      [0, 1, 2].map((i) => (top[i] ?? 0) * alpha + (bottom[i] ?? 0) * (1 - alpha)) as [
        number,
        number,
        number,
      ];

    const paints = (colour: string) => colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent";

    // The two colours the eye compares: the painted text and the painted surface
    // behind it. Each is faded by its own node's opacity and every ancestor's,
    // never a descendant's, and both are composited onto the page behind them.
    const paintedPair = (
      element: Element,
      colour: [number, number, number]
    ): { fg: [number, number, number]; bg: [number, number, number] } | null => {
      const chain: Element[] = [];
      for (let node: Element | null = element; node !== null; node = node.parentElement) {
        chain.push(node);
      }

      const fadeFrom = (index: number) =>
        chain
          .slice(index)
          .reduce((alpha, node) => alpha * Number.parseFloat(getComputedStyle(node).opacity), 1);

      const surfaceIndex = chain.findIndex((node) =>
        paints(getComputedStyle(node).backgroundColor)
      );
      // Behind everything is the page itself, which is opaque by definition —
      // `body` is the one element `globals.css` has always painted.
      const backdrop = toRgb(getComputedStyle(document.body).backgroundColor);
      if (backdrop === null) return null;
      if (surfaceIndex === -1) {
        return { fg: over(colour, fadeFrom(0), backdrop), bg: backdrop };
      }

      const surface = toRgb(getComputedStyle(chain[surfaceIndex] as Element).backgroundColor);
      if (surface === null) return null;
      return {
        fg: over(colour, fadeFrom(0), backdrop),
        bg: over(surface, fadeFrom(surfaceIndex), backdrop),
      };
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
      const declared = toRgb(colour);
      if (declared === null) continue;

      const alpha = Number.parseFloat(style.opacity);
      // Fully transparent text is not text the reader is meant to read; it is
      // a fade-out mid-transition or a hidden node without `visibility`.
      if (alpha === 0) continue;

      const painted = paintedPair(element, declared);
      if (painted === null) continue;
      const { fg, bg } = painted;
      const behind = `rgb(${bg.map(Math.round).join(", ")})`;

      const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      const contrast = ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);

      if (contrast < threshold) {
        offenders.push({
          text: own.slice(0, 40),
          contrast: Number(contrast.toFixed(2)),
          colour: `rgb(${fg.map(Math.round).join(", ")})`,
          behind,
        });
      }
    }

    return offenders;
  }, AA_NORMAL_TEXT);
}

async function expectLegible(page: Page, where: string, scheme: string) {
  const offenders = await lowContrastText(page);

  expect(
    offenders,
    `Text below ${AA_NORMAL_TEXT}:1 in ${scheme} mode on ${where}:\n${JSON.stringify(offenders, null, 2)}`
  ).toEqual([]);
}

// Tailwind emits a utility for every class-shaped string it scans, and what it
// scans is configured, not obvious. A grep of the bundle for a shade should find
// nothing, and the source guard's own fixtures must not be what breaks that.
test("ships no shade utility, whatever the source scan picks up", async ({ page }) => {
  await page.goto("/");

  const selectors = await page.evaluate(() => {
    // Every selector in the sheet, however deeply nested: Tailwind's utilities sit
    // in one `@layer utilities` block, and with CSS nesting a `CSSStyleRule` also
    // answers to `cssRules`. A rule can be both, and is read as both.
    const selectorsOf = (rules: CSSRuleList): string[] =>
      [...rules].flatMap((rule) => [
        ...(typeof (rule as CSSStyleRule).selectorText === "string"
          ? [(rule as CSSStyleRule).selectorText]
          : []),
        ...("cssRules" in rule ? selectorsOf((rule as CSSGroupingRule).cssRules) : []),
      ]);

    return [...document.styleSheets].flatMap((sheet) => {
      try {
        return selectorsOf(sheet.cssRules);
      } catch {
        // A cross-origin sheet cannot be read, and none of ours is.
        return [];
      }
    });
  });

  // Collected in the browser, judged here: the rule itself stays in one place,
  // shared with the source guard, rather than crossing into `evaluate` as a
  // pattern string and becoming a second copy.
  expect(selectors.length).toBeGreaterThan(50);
  const shades = selectors.filter(paintsWithShade);

  expect(shades).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`Colour scheme: ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    for (const [description, path] of PAGES) {
      test(`${description} is legible throughout`, async ({ page }) => {
        await page.goto(path);
        // Something rendered, so an empty page cannot pass vacuously.
        await expect(page.getByRole("heading").first()).toBeVisible();

        await expectLegible(page, path, scheme);
      });
    }

    // At rest `bg-surface` is painted only on a table's current row: every other use is a
    // `hover:` variant or inside the account menu, so a sweep of resting pages mostly walks
    // past the token. Both states below are part of the claim "every rendered string".
    test("a hovered card keeps its text legible against the surface it paints", async ({
      page,
    }) => {
      await page.goto("/");
      const card = page.getByRole("link").filter({ hasText: "Kotimaa" }).first();
      await card.hover();
      // Playwright leaves the pointer where it moved it, so `:hover` is live in
      // the computed styles. Asserted, because a sweep of a card that never
      // painted its surface would pass as loudly as one that did.
      await expect(card).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

      await expectLegible(page, "/ with a hovered region card", scheme);
    });

    test("the open account menu is legible, hovered item included", async ({ page }) => {
      await signedInAs(page, "Matti Meikäläinen");
      await page.goto("/ulkomaat");
      await openAccountMenu(page);

      const settingsLink = page.getByRole("link", { name: "Asetukset" });
      await expect(settingsLink).toBeVisible();
      await settingsLink.hover();
      await expect(settingsLink).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

      await expectLegible(page, "the open account menu", scheme);
    });

    // The sweep's own alarm, checked. Opacity is the one way a colour can be wrong that no token
    // controls, and the only control disabled at rest is the delete-account button on `/asetukset`,
    // which this sweep cannot reach: without this the compositing above is unexercised.
    test("catches text a fade makes illegible, which measuring the declared colour would miss", async ({
      page,
    }) => {
      await page.goto("/");
      await page.evaluate(() => {
        const faded = document.createElement("p");
        faded.textContent = "Melkein näkymätön";
        faded.style.opacity = "0.08";
        document.body.append(faded);
      });

      const offenders = await lowContrastText(page);

      // The declared colour is `--foreground`, which passes everywhere. Only
      // the fade makes it unreadable, so a sweep that ignored opacity would
      // report nothing here.
      expect(offenders.map((offender) => offender.text)).toEqual(["Melkein näkymätön"]);
    });

    // The case fading the text alone gets backwards: a panel that paints a
    // background and carries opacity fades as one group, so faded text against
    // its raw background reports a contrast the reader never sees.
    test("catches a faded panel, whose surface fades along with its text", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => {
        // The app's own two poles, so the panel is maximally legible *before*
        // the fade in either scheme — measuring the raw surface would call
        // this the best contrast on the page.
        const panel = document.createElement("div");
        panel.style.opacity = "0.1";
        panel.style.backgroundColor = "var(--foreground)";
        const text = document.createElement("p");
        text.textContent = "Haalistunut paneeli";
        text.style.color = "var(--background)";
        panel.append(text);
        document.body.append(panel);
      });

      const offenders = await lowContrastText(page);

      expect(offenders.map((offender) => offender.text)).toEqual(["Haalistunut paneeli"]);
    });
  });
}
