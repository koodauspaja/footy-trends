import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminUserTable } from "@/components/admin-user-table";
import type { AdminUser } from "@/lib/admin-user-view";

/**
 * The user list and its controls, from specs/028-admin-tools-and-roles.md.
 *
 * The actions are mocked because they are a `"use server"` boundary; what this
 * file is for is the half a reader touches — which control appears on which
 * row, what a deletion asks before it happens, and that every refusal reaches
 * the screen in Finnish rather than being swallowed.
 */
const { promoteUserAction, demoteUserAction, deleteUserAction } = vi.hoisted(() => ({
  promoteUserAction: vi.fn(),
  demoteUserAction: vi.fn(),
  deleteUserAction: vi.fn(),
}));

vi.mock("@/lib/admin-actions", () => ({
  promoteUserAction,
  demoteUserAction,
  deleteUserAction,
}));

const ADMIN: AdminUser = {
  id: "admin-1",
  email: "admin@example.fi",
  name: "Aino Ylläpitäjä",
  role: "admin",
  createdAt: new Date("2026-03-04T10:00:00Z"),
};
const READER: AdminUser = {
  id: "reader-1",
  email: "lukija@example.fi",
  name: "Lauri Lukija",
  role: "user",
  createdAt: new Date("2026-01-02T10:00:00Z"),
};
const OTHER_ADMIN: AdminUser = { ...ADMIN, id: "admin-2", email: "toinen@example.fi" };

const renderTable = (
  users: AdminUser[] = [ADMIN, READER],
  paging: { page?: number; pages?: number; total?: number } = {}
) =>
  render(
    <AdminUserTable
      currentAdminId="admin-1"
      page={paging.page ?? 1}
      pageParam="sivu"
      pages={paging.pages ?? 1}
      total={paging.total ?? users.length}
      users={users}
    />
  );

beforeEach(() => {
  promoteUserAction.mockReset().mockResolvedValue({ ok: true });
  demoteUserAction.mockReset().mockResolvedValue({ ok: true });
  deleteUserAction.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the list", () => {
  it("shows each user's email, name, role and join date", () => {
    renderTable();

    expect(screen.getByText("lukija@example.fi")).toBeInTheDocument();
    expect(screen.getByText("Lauri Lukija")).toBeInTheDocument();
    expect(screen.getByText("Käyttäjä")).toBeInTheDocument();
    expect(screen.getByText("Ylläpitäjä")).toBeInTheDocument();
    // Finnish date order, in Helsinki, like the rest of the app.
    expect(screen.getByText("2.1.2026")).toBeInTheDocument();
  });

  it("counts the users in Finnish", () => {
    renderTable();

    expect(screen.getByText("2 käyttäjää")).toBeInTheDocument();
  });

  it("shows no paging controls when everything fits on one page", () => {
    renderTable();

    expect(screen.queryByRole("navigation", { name: "Sivutus" })).toBeNull();
  });

  it("counts every user, not just the ones on this page", () => {
    renderTable([READER], { page: 2, pages: 4, total: 173 });

    expect(screen.getByText("173 käyttäjää")).toBeInTheDocument();
  });

  it("says so when there is nobody, rather than rendering an empty table", () => {
    renderTable([], { total: 0 });

    expect(screen.getByText("Ei käyttäjiä.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("keeps the heading and the count when the list is empty", () => {
    // The page has the same shape empty as full. An early return dropped both,
    // which is what review caught: "the query answered nothing" and "the table
    // is empty" must not render as the same thing.
    renderTable([], { total: 0 });

    expect(screen.getByRole("heading", { name: "Käyttäjät" })).toBeInTheDocument();
    expect(screen.getByText("0 käyttäjää")).toBeInTheDocument();
  });
});

describe("the acting admin's own row", () => {
  it("offers no controls at all", () => {
    renderTable([ADMIN]);

    // The actions refuse it anyway; offering a button whose only outcome is a
    // refusal is a worse answer than not offering it.
    expect(screen.queryByRole("button", { name: "Poista ylläpito-oikeudet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Poista tili" })).toBeNull();
  });

  it("still lists them", () => {
    renderTable([ADMIN]);

    expect(screen.getByText("admin@example.fi")).toBeInTheDocument();
  });
});

describe("changing a role", () => {
  it("offers promotion to a reader, and calls it", async () => {
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Tee ylläpitäjäksi" }));

    expect(promoteUserAction).toHaveBeenCalledWith("reader-1");
    expect(demoteUserAction).not.toHaveBeenCalled();
  });

  it("offers demotion to another admin, and calls it", async () => {
    renderTable([OTHER_ADMIN]);

    fireEvent.click(screen.getByRole("button", { name: "Poista ylläpito-oikeudet" }));

    expect(demoteUserAction).toHaveBeenCalledWith("admin-2");
    expect(promoteUserAction).not.toHaveBeenCalled();
  });
});

describe("deleting", () => {
  it("asks first, naming the account", async () => {
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Poista tili" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Poistetaanko lukija@example.fi pysyvästi?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Tämä poistaa tilin, suosikit, asetukset ja profiilikuvan. Tätä ei voi perua."
      )
    ).toBeInTheDocument();
    // Nothing has happened yet — the question is the point.
    expect(deleteUserAction).not.toHaveBeenCalled();
  });

  it("deletes only after the confirmation is taken", async () => {
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Poista tili" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Poista tili" }).at(-1) as HTMLElement);

    expect(deleteUserAction).toHaveBeenCalledWith("reader-1");
  });

  it("cancels without deleting", async () => {
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Poista tili" }));
    fireEvent.click(screen.getByRole("button", { name: "Peruuta" }));

    expect(deleteUserAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("refusals reach the reader, in Finnish", () => {
  it.each([
    ["self", "Et voi muuttaa omaa rooliasi tai poistaa omaa tiliäsi täällä."],
    ["last_admin", "Viimeistä ylläpitäjää ei voi poistaa."],
    ["not_found", "Käyttäjää ei löytynyt. Lista on päivitetty."],
    ["failed", "Toiminto epäonnistui. Yritä uudelleen."],
  ])("shows the %s message", async (reason, message) => {
    promoteUserAction.mockResolvedValue({ ok: false, reason });
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Tee ylläpitäjäksi" }));

    // `findBy` rather than `getBy`: the refusal is rendered after the action
    // resolves, so asserting synchronously would race the transition. No
    // `act()` — `fireEvent` wraps its own updates already.
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("treats a thrown action as a failure rather than letting it escape", async () => {
    promoteUserAction.mockRejectedValue(new Error("network gone"));
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Tee ylläpitäjäksi" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Toiminto epäonnistui. Yritä uudelleen."
    );
  });

  it("clears a previous refusal when another action is tried", async () => {
    promoteUserAction.mockResolvedValue({ ok: false, reason: "failed" });
    renderTable([READER]);

    fireEvent.click(screen.getByRole("button", { name: "Tee ylläpitäjäksi" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    promoteUserAction.mockResolvedValue({ ok: true });
    const promote = screen.getByRole("button", { name: "Tee ylläpitäjäksi" });

    /**
     * A stale error beside a successful action reads as a failure that did not
     * happen.
     *
     * **Wait for the button, not for the alert** (#408). Every button is
     * `disabled={pending}`, and a click on a disabled button is swallowed. The
     * refusal is set *after an `await`* inside `startTransition`, which React
     * commits as an ordinary update — so it can reach the screen before the
     * transition's own "no longer pending" commit. On a loaded runner the alert
     * is then visible while the button is still disabled, the second click does
     * nothing, and the alert never clears. That is what #408 recorded: three CI
     * failures in which the alert was still there, with its text, after the
     * whole 5 s budget. It was stuck, not late, and no budget waits that out.
     *
     * So the test waits for the one thing the click needs, the button enabled,
     * and then asserts the clear with no wall-clock budget at all: `setNotice
     * (null)` runs in the click handler, which `fireEvent` flushes before it
     * returns.
     *
     * **What #388 measured, kept because it is still true of what it tested.**
     * Under four CPU hogs, a 1 s budget on the old assertion failed 1 in 10 and
     * 5 s failed 0 in 15; and across 12 contended runs `pending` had already
     * cleared whenever the alert was visible. That sample was too small for a
     * race this rare, which is why its conclusion — "the alert does clear; it
     * clears late" — did not hold on CI. Mock state leaking from the test above
     * was ruled out then and still is: the text is this test's own
     * `REFUSALS.failed`.
     *
     * **The race could not be forced here.** It depends on the order in which
     * React commits two updates, which a test cannot choose, and it did not
     * occur in 25 contended local runs. The fix removes the dependency instead
     * of reproducing it.
     *
     * The test's own limit stays at 15 s, above the enablement wait's 5 s:
     * Vitest's default per-test limit is 5 s — measured, not assumed, a test
     * sleeping 7 s fails at 5008 ms — and the render, the first click and its
     * alert spend part of the same time first.
     */
    await waitFor(() => expect(promote).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(promote);

    expect(screen.queryByRole("alert")).toBeNull();
  }, 15_000);
});

describe("paging", () => {
  it("links to the next and previous pages, and says where you are", () => {
    renderTable([READER], { page: 2, pages: 4, total: 173 });

    expect(screen.getByRole("link", { name: "Edellinen" })).toHaveAttribute("href", "?sivu=1");
    expect(screen.getByRole("link", { name: "Seuraava" })).toHaveAttribute("href", "?sivu=3");
    expect(screen.getByText("Sivu 2 / 4")).toBeInTheDocument();
  });

  it("offers no previous on the first page", () => {
    renderTable([READER], { page: 1, pages: 4, total: 173 });

    // Rendered as text rather than dropped, so the controls do not move
    // between pages.
    expect(screen.queryByRole("link", { name: "Edellinen" })).toBeNull();
    expect(screen.getByText("Edellinen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Seuraava" })).toHaveAttribute("href", "?sivu=2");
  });

  it("offers no next on the last page", () => {
    renderTable([READER], { page: 4, pages: 4, total: 173 });

    expect(screen.queryByRole("link", { name: "Seuraava" })).toBeNull();
    expect(screen.getByText("Seuraava")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edellinen" })).toHaveAttribute("href", "?sivu=3");
  });

  it("uses the parameter name the page gave it", () => {
    // The page owns the parameter's name; a second literal here is how the two
    // drift and the links start pointing at a page nobody reads.
    render(
      <AdminUserTable
        currentAdminId="admin-1"
        page={1}
        pageParam="page"
        pages={2}
        total={60}
        users={[READER]}
      />
    );

    expect(screen.getByRole("link", { name: "Seuraava" })).toHaveAttribute("href", "?page=2");
  });
});
