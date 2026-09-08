import { expect, type Page, test } from "@playwright/test";
import { openAccountMenu, signedInAs } from "./session";

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

    /**
     * Everything the element and its ancestors fade it by, multiplied
     * together. `disabled:opacity-50` is the case in the app today, and the
     * reader sees the faded colour rather than the declared one — so measuring
     * `style.color` alone would pass text that is not legible.
     */
    const fade = (element: Element): number => {
      let alpha = 1;
      let node: Element | null = element;
      while (node !== null) {
        alpha *= Number.parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      return alpha;
    };

    /** What the reader actually sees: the text faded onto what is behind it. */
    const painted = (
      fg: [number, number, number],
      bg: [number, number, number],
      alpha: number
    ): [number, number, number] =>
      [0, 1, 2].map((i) => (fg[i] ?? 0) * alpha + (bg[i] ?? 0) * (1 - alpha)) as [
        number,
        number,
        number,
      ];

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

      const alpha = fade(element);
      // Fully transparent text is not text the reader is meant to read; it is
      // a fade-out mid-transition or a hidden node without `visibility`.
      if (alpha === 0) continue;

      const [lighter, darker] = [luminance(painted(fg, bg, alpha)), luminance(bg)].sort(
        (a, b) => b - a
      );
      const contrast = ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);

      if (contrast < threshold) {
        offenders.push({
          text: own.slice(0, 40),
          contrast: Number(contrast.toFixed(2)),
          colour: alpha === 1 ? colour : `${colour} at ${alpha} opacity`,
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

    /**
     * `bg-surface` is painted by nothing at rest.
     *
     * Every use of it in the app is a `hover:` variant or sits inside the
     * account menu, so a sweep of resting pages walks past the token entirely
     * — including on the very panel whose colours started this (#273). Both
     * states below are therefore part of the claim "every rendered string",
     * not extras.
     */
    test("a hovered card keeps its text legible against the surface it paints", async ({
      page,
    }) => {
      await page.goto("/");
      const card = page.getByRole("link").filter({ hasText: "Kotimaa" }).first();
      await card.hover();
      // Playwright leaves the pointer where it moved it, so `:hover` is live
      // in the computed styles the sweep reads. Asserted rather than assumed,
      // because a sweep of a card that never painted its surface would pass
      // exactly as loudly as one that did.
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

    /**
     * The sweep's own alarm, checked rather than assumed.
     *
     * Opacity is the one way a colour can be wrong that no token controls, and
     * the only place the app uses it today — `disabled:opacity-50` on the
     * delete-account button — sits on a page this sweep cannot reach, because
     * `/asetukset` reads its session on the server. Without this test the
     * compositing above is unexercised code claiming coverage it never
     * demonstrates.
     */
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
  });
}
