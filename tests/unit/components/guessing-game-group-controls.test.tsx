import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CreateGroupForm,
  DeleteGroupButton,
  InviteLink,
  JoinGroupButton,
  LeaveGroupButton,
  RemoveMemberButton,
  RenameGroupForm,
  RenewLinkButton,
} from "@/components/guessing-game-group-controls";

/**
 * Arvauspeli's group controls as a player uses them: what each sends, where it
 * goes after, the confirmation before each lasting action, each refusal shown
 * in Finnish, and a page that no longer matches the group reloaded.
 *
 * decisions/078-private-groups.md
 */

const { actions, push, refresh, reportClientError } = vi.hoisted(() => ({
  actions: {
    createGroupAction: vi.fn(),
    joinGroupAction: vi.fn(),
    leaveGroupAction: vi.fn(),
    removeMemberAction: vi.fn(),
    renameGroupAction: vi.fn(),
    renewInviteLinkAction: vi.fn(),
    deleteGroupAction: vi.fn(),
  },
  push: vi.fn(),
  refresh: vi.fn(),
  reportClientError: vi.fn(),
}));

vi.mock("@/lib/guessing-game-group-actions", () => actions);
vi.mock("@/lib/report-client-error", () => ({ reportClientError }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const TOKEN = "a".repeat(43);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CreateGroupForm", () => {
  function create(name: string) {
    render(<CreateGroupForm />);
    fireEvent.change(screen.getByLabelText("Ryhmän nimi"), { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Perusta ryhmä" }));
  }

  it("creates the group under the name typed, and opens its page", async () => {
    actions.createGroupAction.mockResolvedValue({ ok: true, groupId: 5 });
    create("Kaverit");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/arvauspeli/ryhmat/5"));
    expect(actions.createGroupAction).toHaveBeenCalledWith("Kaverit");
  });

  it.each([
    ["name-length", "Ryhmän nimen pituus on 3–30 merkkiä."],
    [
      "name-characters",
      "Ryhmän nimessä voi olla kirjaimia, numeroita, välilyöntejä sekä merkit -, _ ja .",
    ],
    ["word-list", "Valitse ryhmälle toinen nimi."],
    ["group-limit", "Voit kuulua enintään 10 ryhmään."],
    ["failed", "Ryhmän tallentaminen epäonnistui. Yritä uudelleen."],
  ])("says the refusal %s under the field", async (reason, line) => {
    actions.createGroupAction.mockResolvedValue({ ok: false, reason });
    create("ab");
    expect(await screen.findByRole("alert")).toHaveTextContent(line);
    expect(push).not.toHaveBeenCalled();
  });

  it("reports a thrown call and says it failed", async () => {
    actions.createGroupAction.mockRejectedValue(new Error("network"));
    create("Kaverit");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ryhmän tallentaminen epäonnistui. Yritä uudelleen."
    );
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), "guessing-game.group.create");
  });
});

describe("RenameGroupForm", () => {
  it("holds the current name, saves the new one and refreshes", async () => {
    actions.renameGroupAction.mockResolvedValue({ ok: true });
    render(<RenameGroupForm groupId={5} name="Kaverit" />);
    expect(screen.getByLabelText("Ryhmän nimi")).toHaveValue("Kaverit");
    fireEvent.change(screen.getByLabelText("Ryhmän nimi"), { target: { value: "Uusi" } });
    fireEvent.click(screen.getByRole("button", { name: "Tallenna nimi" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.renameGroupAction).toHaveBeenCalledWith(5, "Uusi");
  });

  it("reloads a page that no longer matches the group, saying nothing", async () => {
    actions.renameGroupAction.mockResolvedValue({ ok: false, reason: "stale" });
    render(<RenameGroupForm groupId={5} name="Kaverit" />);
    fireEvent.click(screen.getByRole("button", { name: "Tallenna nimi" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("JoinGroupButton", () => {
  it("says it joins the game too for a reader not yet playing", () => {
    render(<JoinGroupButton player={false} token={TOKEN} />);
    expect(screen.getByRole("button", { name: "Liity peliin ja ryhmään" })).toBeInTheDocument();
  });

  it("joins by the token and opens the group's page", async () => {
    actions.joinGroupAction.mockResolvedValue({ ok: true, groupId: 5 });
    render(<JoinGroupButton player token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Liity ryhmään" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/arvauspeli/ryhmat/5"));
    expect(actions.joinGroupAction).toHaveBeenCalledWith(TOKEN);
  });

  it.each([
    ["full", "Ryhmä on täynnä (50 jäsentä)."],
    ["invalid-link", "Kutsulinkki ei ole voimassa. Pyydä ryhmän jäseneltä uusi linkki."],
  ])("says the refusal %s", async (reason, line) => {
    actions.joinGroupAction.mockResolvedValue({ ok: false, reason });
    render(<JoinGroupButton player token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Liity ryhmään" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(line);
  });
});

describe("InviteLink", () => {
  it("shows the link in full by the address the reader is on, and copies it", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const { unmount } = render(<InviteLink token={TOKEN} />);
    const url = `${window.location.origin}/arvauspeli/liity/${TOKEN}`;
    expect(screen.getByText(url)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Kopioi linkki" }));

    expect(await screen.findByText("Linkki kopioitu.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(url);
    unmount();
  });

  it("renders the path alone on the server, before the browser has its address", () => {
    const html = renderToString(<InviteLink token={TOKEN} />);
    expect(html).toContain(`>/arvauspeli/liity/${TOKEN}<`);
  });

  it("says so when the copy is refused", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    render(<InviteLink token={TOKEN} />);
    fireEvent.click(screen.getByRole("button", { name: "Kopioi linkki" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kopiointi epäonnistui.");
    expect(reportClientError).toHaveBeenCalledWith(expect.any(Error), "guessing-game.group.copy");
  });
});

describe("the confirmed actions", () => {
  it("asks first, and does nothing when cancelled", () => {
    render(<DeleteGroupButton groupId={5} name="Kaverit" />);
    fireEvent.click(screen.getByRole("button", { name: "Poista ryhmä" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Poistetaanko ryhmä Kaverit? Ryhmän tulostaulukko katoaa, pelimerkit eivät."
    );
    fireEvent.click(screen.getByRole("button", { name: "Peruuta" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(actions.deleteGroupAction).not.toHaveBeenCalled();
  });

  function confirm(label: string, { open } = { open: false }) {
    if (!open) fireEvent.click(screen.getByRole("button", { name: label }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      [...dialog.querySelectorAll("button")].find(
        (button) => button.textContent === label
      ) as Element
    );
  }

  it("deletes the group once confirmed, and returns to the game", async () => {
    actions.deleteGroupAction.mockResolvedValue({ ok: true });
    render(<DeleteGroupButton groupId={5} name="Kaverit" />);
    confirm("Poista ryhmä");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/arvauspeli"));
    expect(actions.deleteGroupAction).toHaveBeenCalledWith(5);
  });

  it("leaves once confirmed, telling an owner with others that ownership passes on", async () => {
    actions.leaveGroupAction.mockResolvedValue({ ok: true });
    render(<LeaveGroupButton groupId={5} name="Kaverit" passesOn />);
    fireEvent.click(screen.getByRole("button", { name: "Poistu ryhmästä" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Poistutaanko ryhmästä Kaverit?Omistajuus siirtyy ryhmän pisimpään jäsenenä olleelle."
    );
    fireEvent.click(screen.getByRole("button", { name: "Peruuta" }));
    confirm("Poistu ryhmästä");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/arvauspeli"));
    expect(actions.leaveGroupAction).toHaveBeenCalledWith(5);
  });

  it("tells a member leaving nothing of ownership", () => {
    render(<LeaveGroupButton groupId={5} name="Kaverit" passesOn={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Poistu ryhmästä" }));
    expect(screen.getByRole("alertdialog")).not.toHaveTextContent("Omistajuus");
  });

  it("removes a member by their membership once confirmed, and refreshes", async () => {
    actions.removeMemberAction.mockResolvedValue({ ok: true });
    render(<RemoveMemberButton groupId={5} membershipId={2} nickname="Kalle" />);
    fireEvent.click(screen.getByRole("button", { name: "Poista ryhmästä" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Poistetaanko Kalle ryhmästä?");
    confirm("Poista ryhmästä", { open: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(actions.removeMemberAction).toHaveBeenCalledWith(5, 2);
  });

  it("renews the link once confirmed, and refreshes; a failure is said", async () => {
    actions.renewInviteLinkAction.mockResolvedValueOnce({ ok: true });
    render(<RenewLinkButton groupId={5} />);
    fireEvent.click(screen.getByRole("button", { name: "Uusi linkki" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Vanha linkki lakkaa toimimasta. Jatketaanko?"
    );
    fireEvent.click(screen.getByRole("button", { name: "Peruuta" }));
    confirm("Uusi linkki");
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    actions.renewInviteLinkAction.mockResolvedValueOnce({ ok: false, reason: "failed" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Uusi linkki" })).toBeEnabled());
    confirm("Uusi linkki");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ryhmän tallentaminen epäonnistui. Yritä uudelleen."
    );
  });
});
