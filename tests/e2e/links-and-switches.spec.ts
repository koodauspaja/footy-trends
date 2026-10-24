import { expect, type Locator, test } from "@playwright/test";
import { E2E_ANALYTICS_HEADER, E2E_SIGNED_IN } from "../../src/lib/e2e-analytics";
import { SESSION_COOKIE, storeSignedInReader } from "../support/e2e-session";
import { openEveryFold } from "./folds";
import { signedInAs } from "./session";

/**
 * A link can be told from plain text in both schemes: underlined in the colour
 * of the text around it, unless a box or its place among many alike says it is
 * a link. A switch fills its chosen view. jsdom has no CSS, so only a browser
 * shows either.
 *
 * decisions/701-links-and-switches.md
 */

const STANDINGS = "/kotimaa/sarjataulukko?kilpailu=VL&kausi=2026";

// A computed colour with no strength, which paints nothing whatever it differs from.
const CLEAR = /^rgba\(.*,\s*0\)$/;

// The links the sweep found looking like plain text, each on a page that has it.
const FOUND: ReadonlyArray<readonly [string, string, string | RegExp]> = [
  ["a standings page's", STANDINGS, "Kaikki ottelut"],
  ["a team page's", "/ulkomaat/joukkue/57?kilpailu=PL&kausi=2024", "Sarjataulukkoon"],
  ["a played match's", "/kotimaa/ottelu/4036852", /^Kaikki kohtaamiset/],
  ["an upcoming match's", "/kotimaa/ottelu/4353547", "Kuinka hyvin ennusteet ovat osuneet?"],
  ["the missing page's", "/ei-ole-olemassa", "Etusivulle"],
];

// How a link's line is drawn, and the colour of the text it sits in.
function drawn(link: Locator) {
  return link.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      line: style.textDecorationLine,
      thickness: style.textDecorationThickness,
      colour: style.color,
      lineColour: style.textDecorationColor,
      around: getComputedStyle(element.parentElement ?? element).color,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ [E2E_ANALYTICS_HEADER]: E2E_SIGNED_IN });
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`In the ${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    for (const [where, path, name] of FOUND) {
      test(`underlines ${where} link in the colour of the text around it`, async ({ page }) => {
        await page.goto(path);
        const link = page.getByRole("link", { name }).first();
        await expect(link).toBeVisible();

        const { line, thickness, colour, lineColour, around } = await drawn(link);
        expect(line).toBe("underline");
        expect(thickness).toBe("1px");
        expect(colour).toBe(around);
        expect(lineColour).toBe(colour);
      });
    }

    test("fills a switch's chosen view in the text's colour, and boxes the other", async ({
      page,
    }) => {
      await page.goto("/ennusteet");
      const chosen = page.getByRole("link", { name: "Kotimaa", exact: true });
      await expect(chosen).toHaveAttribute("aria-current", "page");

      const painted = await chosen.evaluate((element) => {
        const body = getComputedStyle(document.body);
        const other = element.closest("ul")?.querySelector("a:not([aria-current])");
        const group = getComputedStyle(element.closest("ul") ?? element);
        return {
          fill: getComputedStyle(element).backgroundColor,
          text: getComputedStyle(element).color,
          pageText: body.color,
          pageBackground: body.backgroundColor,
          otherFill: other ? getComputedStyle(other).backgroundColor : "",
          border: group.borderTopWidth,
          borderColour: group.borderTopColor,
          clips: group.overflowX !== "visible" || group.overflowY !== "visible",
        };
      });
      expect(painted.fill).toBe(painted.pageText);
      expect(painted.text).toBe(painted.pageBackground);
      expect(painted.otherFill).toBe("rgba(0, 0, 0, 0)");
      expect(painted.border).toBe("1px");
      expect(painted.borderColour).not.toMatch(CLEAR);
      expect(painted.borderColour).not.toBe(painted.pageBackground);
      // A focused option's outline reaches past the group's edge.
      expect(painted.clips).toBe(false);
      await chosen.focus();
      const outline = await chosen.evaluate((element) => getComputedStyle(element).outlineStyle);
      expect(outline).not.toBe("none");
    });
  });
}

test("thickens a link's line on hover, and underlines a table's name only then", async ({
  page,
}) => {
  await page.goto(STANDINGS);
  const link = page.getByRole("link", { name: "Kaikki ottelut" });
  await link.hover();
  expect((await drawn(link)).thickness).toBe("2px");

  const team = page.locator("table").getByRole("link").first();
  await expect(team).toBeVisible();
  expect((await drawn(team)).line).toBe("none");
  await team.hover();
  expect((await drawn(team)).line).toBe("underline");
});

// Pages with every kind of link: prose, cards, a table, a switch, the footer.
const WALKED = ["/", "/tietosuoja", "/ennusteet", ...FOUND.map(([, path]) => path)];

for (const path of WALKED) {
  test(`leaves no link on ${path} looking like plain text`, async ({ page }) => {
    await page.goto(path);
    // The page streams behind `Ladataan...`, which holds no link to judge.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Ladataan...")).toHaveCount(0);
    await openEveryFold(page);

    const plain = await page.evaluate((clearSource) => {
      const clear = new RegExp(clearSource);
      const behind = getComputedStyle(document.body).backgroundColor;
      const shows = (colour: string) => !clear.test(colour) && colour !== behind;
      // A border or a fill marks a link only when it can be seen.
      const boxed = (element: Element | null) => {
        if (element === null) return false;
        const style = getComputedStyle(element);
        const border = Number.parseFloat(style.borderTopWidth) > 0 && shows(style.borderTopColor);
        return border || shows(style.backgroundColor);
      };
      return [...document.querySelectorAll("a")]
        .filter((link) => link.getClientRects().length > 0)
        .filter((link) => !getComputedStyle(link).textDecorationLine.includes("underline"))
        .filter((link) => !link.classList.contains("quiet-link"))
        .filter((link) => !boxed(link) && !boxed(link.closest("ul")))
        .map((link) => link.textContent);
    }, CLEAR.source);
    expect(plain).toEqual([]);
  });
}

test("draws the header's search button as a control", async ({ page }) => {
  await signedInAs(page, "Matti Meikäläinen");
  await page.goto("/");
  const button = page.getByRole("button", { name: "Hae" });
  await expect(button).toBeVisible();

  // Every side, so a button drawn as a line rather than a box fails.
  const { sides, behind } = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      sides: (["Top", "Right", "Bottom", "Left"] as const).map((side) => ({
        width: style.getPropertyValue(`border-${side.toLowerCase()}-width`),
        colour: style.getPropertyValue(`border-${side.toLowerCase()}-color`),
      })),
      behind: getComputedStyle(document.body).backgroundColor,
    };
  });
  for (const { width, colour } of sides) {
    expect(width).toBe("1px");
    expect(colour).not.toMatch(CLEAR);
    expect(colour).not.toBe(behind);
  }
});

test.describe("Signed in as the admin", () => {
  let admin: Awaited<ReturnType<typeof storeSignedInReader>>;

  test.beforeAll(async () => {
    admin = await storeSignedInReader("admin");
  });

  test.afterAll(async () => {
    await admin?.remove();
  });

  test("draws the admin page's link as every other", async ({ page, baseURL }) => {
    await page
      .context()
      .addCookies([{ name: SESSION_COOKIE, value: admin.cookie, url: baseURL as string }]);
    await page.goto("/yllapito");
    const link = page.getByRole("link", { name: "Kauden uudelleenhaku" });
    await expect(link).toBeVisible();

    const { line, thickness, colour, around } = await drawn(link);
    expect(line).toBe("underline");
    expect(thickness).toBe("1px");
    expect(colour).toBe(around);
  });
});
