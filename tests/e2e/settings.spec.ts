import { expect, type Page, test } from "@playwright/test";
import { openAccountMenu, signedInAs, waitForSession } from "./session";

/**
 * The account settings page. The signed-in cases intercept `/api/auth/get-session`,
 * which reaches the header and the account menu and not the page body. The round
 * trip through Google stays a human check on staging.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 * decisions/269-colour-roles.md
 */

test.describe("Settings, signed out", () => {
  test("explains itself instead of redirecting", async ({ page }) => {
    await page.goto("/asetukset");

    // No redirect and no middleware: the page renders and says why it is empty.
    await expect(page).toHaveURL(/\/asetukset$/);
    await expect(page.getByRole("heading", { name: "Asetukset" })).toBeVisible();
    await expect(page.getByText("Kirjaudu sisään nähdäksesi asetuksesi.")).toBeVisible();
  });

  test("shows no preferences, devices or deletion controls", async ({ page }) => {
    await page.goto("/asetukset");

    await expect(page.getByText("Aloitusnäkymä")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Poista tili" })).toHaveCount(0);
  });

  test("offers no profile picture controls", async ({ page }) => {
    // There is no identity to attach a picture to.
    await page.goto("/asetukset");

    await expect(page.getByRole("heading", { name: "Profiilikuva" })).toHaveCount(0);
    await expect(page.getByLabel("Valitse kuva")).toHaveCount(0);
  });

  test("will not serve an avatar to nobody", async ({ request }) => {
    // The handler reads the session and nothing else: there is no id in the URL
    // to guess. Asserted end to end, because the answer depends on real
    // middleware and real cookies.
    const response = await request.get("/api/avatar/me");

    expect(response.status()).toBe(401);
  });

  test("is reachable on the Finnish URL, and the English one redirects", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/asetukset$/);
  });
});

// The signed-in page body is not covered here: `/asetukset` reads its session on the server,
// beyond the browser-side interception, so `tests/unit/components/settings-page.test.tsx`
// covers it. What follows is what can be driven end to end.

// The contrast of an element against what is painted behind it, walking up for
// the first non-transparent background: the panel, not the page. Only a real
// browser has layout and computed colours.
async function contrastOf(page: Page, name: string): Promise<number> {
  return page.getByRole("link", { name }).evaluate((element) => {
    const toRgb = (css: string) => {
      const canvas = document.createElement("canvas").getContext("2d");
      if (canvas === null) return [0, 0, 0];
      canvas.fillStyle = css;
      const hex = canvas.fillStyle as string;
      return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((channel) => {
        const s = channel / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };

    let behind: Element | null = element;
    let background = "rgba(0, 0, 0, 0)";
    while (behind !== null) {
      const colour = getComputedStyle(behind).backgroundColor;
      if (colour !== "rgba(0, 0, 0, 0)" && colour !== "transparent") {
        background = colour;
        break;
      }
      behind = behind.parentElement;
    }

    const [a, b] = [
      luminance(toRgb(getComputedStyle(element).color)),
      luminance(toRgb(background)),
    ].sort((x, y) => y - x);
    return ((a ?? 0) + 0.05) / ((b ?? 0) + 0.05);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`The account menu in ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    test("renders its items legibly against the panel behind them", async ({ page }) => {
      // The panel's surface must follow the theme as its text does: a pinned
      // white behind themed text is present, but invisible, in dark mode.
      await signedInAs(page, "Matti Meikäläinen");
      await page.goto("/ulkomaat");
      await openAccountMenu(page);

      expect(await contrastOf(page, "Asetukset")).toBeGreaterThanOrEqual(4.5);
    });
  });
}

test.describe("The account menu", () => {
  // jsdom only ever drives outside-click dismissal with a synthesised `pointerdown`. A
  // real browser fires pointerdown, mousedown, a focus change, then click, and the
  // focus rescue runs on a timer in the middle: only here is it real.
  test("closes when the reader clicks the page behind it", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/ulkomaat");

    await openAccountMenu(page);
    await expect(page.getByRole("link", { name: "Asetukset" })).toBeVisible();

    // Well below the header, on ordinary page content.
    await page.mouse.click(20, 400);

    await expect(page.getByRole("link", { name: "Asetukset" })).toHaveCount(0);
    // Still usable afterwards — the rescue must not have left the trigger in a
    // state that swallows the next click.
    await openAccountMenu(page);
    await expect(page.getByRole("link", { name: "Asetukset" })).toBeVisible();
  });

  test("reaches the settings page", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen");
    await page.goto("/ulkomaat");

    await openAccountMenu(page);
    await page.getByRole("link", { name: "Asetukset" }).click();

    await expect(page).toHaveURL(/\/asetukset$/);
  });
});

test.describe("A stored start page", () => {
  test("opens the reader's region instead of the picker", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", "kotimaa");
    await page.goto("/");

    await expect(page).toHaveURL(/\/kotimaa$/);
  });

  test("never makes the region picker unreachable", async ({ page }) => {
    // The escape hatch. Without it a reader with a start page could not reach
    // the picker by clicking at all.
    await signedInAs(page, "Matti Meikäläinen", "kotimaa");
    await page.goto("/?valitse=1");
    await waitForSession(page);

    await expect(page).toHaveURL(/\/\?valitse=1$/);
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });

  test("is reachable by clicking Etusivu, not only by typing a URL", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", "kotimaa");
    await page.goto("/ulkomaat");

    await waitForSession(page);
    await page.getByRole("link", { name: "Etusivu" }).click();
    await waitForSession(page);

    await expect(page).toHaveURL(/valitse=1$/);
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });

  test("leaves a reader without one on the picker", async ({ page }) => {
    await signedInAs(page, "Matti Meikäläinen", null);
    await page.goto("/");
    await waitForSession(page);

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Valitse alue" })).toBeVisible();
  });
});
