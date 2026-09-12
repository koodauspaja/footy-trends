import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "@/components/account-menu";

const onSignOut = vi.fn();

function renderMenu(overrides: { name?: string; image?: string | null; isAdmin?: boolean } = {}) {
  return render(
    <AccountMenu
      image={overrides.image ?? null}
      // Defaults to a reader, so every existing test keeps asserting the menu a
      // reader sees, and the admin link only appears where a test asks for it.
      isAdmin={overrides.isAdmin ?? false}
      name={overrides.name ?? "Matti Meikäläinen"}
      onSignOut={onSignOut}
    />
  );
}

const trigger = () => screen.getByRole("button", { name: "Tili: Matti Meikäläinen" });

beforeEach(() => {
  onSignOut.mockClear();
});

describe("AccountMenu", () => {
  it("starts closed", () => {
    renderMenu();

    expect(screen.queryByRole("link", { name: "Asetukset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kirjaudu ulos" })).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("opens on click and offers both account actions", () => {
    renderMenu();

    fireEvent.click(trigger());

    // Above `Asetukset`, so the reader's own things sit together
    // (specs/026-favourites.md).
    expect(screen.getByRole("link", { name: "Suosikit" })).toHaveAttribute("href", "/suosikit");
    expect(screen.getByRole("link", { name: "Asetukset" })).toHaveAttribute("href", "/asetukset");
    expect(screen.getByRole("button", { name: "Kirjaudu ulos" })).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on a second click of the trigger", () => {
    renderMenu();

    fireEvent.click(trigger());
    fireEvent.click(trigger());

    expect(screen.queryByRole("link", { name: "Asetukset" })).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    // A keyboard reader who dismisses the menu must not be dropped at the top
    // of the document.
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("link", { name: "Asetukset" })).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("closes on a click outside itself", () => {
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("link", { name: "Asetukset" })).not.toBeInTheDocument();
  });

  it("signs out and closes when the item is chosen", () => {
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("button", { name: "Kirjaudu ulos" }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Kirjaudu ulos" })).not.toBeInTheDocument();
  });

  it("shows the name when the reader has no Google avatar", () => {
    renderMenu({ image: null });

    expect(screen.getByText("Matti Meikäläinen")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the avatar with an empty alt, and stays a named button", () => {
    renderMenu({ image: "https://example.com/avatar.png" });

    // Empty alt: the button already carries the name, so repeating it is noise.
    // The trigger must never become an unlabelled button, which is what an
    // avatar without `aria-label` would be.
    const avatar = document.querySelector("img");
    expect(avatar).toHaveAttribute("alt", "");
    expect(trigger()).toBeInTheDocument();
  });

  it("does not claim ARIA menu semantics it cannot honour", () => {
    // No arrow-key navigation or typeahead is implemented, so promising
    // `role="menu"` would mislead a screen reader. It is a disclosure.
    renderMenu();
    fireEvent.click(trigger());

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-controls");
  });

  it("closes when the favourites link is chosen", () => {
    // The same closing behaviour as the settings link below; a menu left open
    // over the page it navigated to is the bug this prevents.
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("link", { name: "Suosikit" }));

    expect(screen.queryByRole("link", { name: "Suosikit" })).not.toBeInTheDocument();
  });

  it("closes when the settings link is chosen", () => {
    // Closing on navigation, but without pulling focus back to the trigger —
    // that would drop a keyboard reader at the top of the header on every visit.
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByRole("link", { name: "Asetukset" }));

    expect(screen.queryByRole("link", { name: "Asetukset" })).not.toBeInTheDocument();
    expect(trigger()).not.toHaveFocus();
  });

  it("stays open on keys that are not Escape", () => {
    // A menu that closed on any keypress would be unusable with a keyboard.
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.keyDown(document, { key: "a" });
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("link", { name: "Asetukset" })).toBeInTheDocument();
  });

  it("stays open when the pointer goes down inside it", () => {
    // Only an *outside* click dismisses. Otherwise reaching for an item would
    // close the menu before the click landed.
    renderMenu();
    fireEvent.click(trigger());

    fireEvent.pointerDown(screen.getByRole("link", { name: "Asetukset" }));

    expect(screen.getByRole("link", { name: "Asetukset" })).toBeInTheDocument();
  });

  /**
   * The rescue runs on a zero-delay timer, so these three flush it
   * deterministically rather than sleeping.
   *
   * A sleep would be a race — and `waitFor` would be worse here than a sleep:
   * "focus was *not* stolen" is already true before the timer fires, so it
   * would pass without ever observing the settled state. Running the timer is
   * the only way to assert on what happens after it.
   */
  function flushFocusRescue() {
    act(() => {
      vi.runAllTimers();
    });
  }

  it("rescues focus that an outside click would otherwise orphan", () => {
    // A keyboard reader tabs into the menu, then clicks empty space. The
    // focused element unmounts with the menu and focus falls to `<body>` —
    // measured, which is why this rescue exists at all.
    vi.useFakeTimers();
    try {
      renderMenu();
      fireEvent.click(trigger());
      screen.getByRole("button", { name: "Kirjaudu ulos" }).focus();

      fireEvent.pointerDown(document.body);
      flushFocusRescue();

      expect(trigger()).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not steal focus from whatever the reader clicked instead", () => {
    // The opposite failure: a click is itself a focus request, and overriding
    // it would yank the reader back to the header.
    vi.useFakeTimers();
    const elsewhere = document.createElement("button");
    elsewhere.textContent = "Muu painike";
    document.body.append(elsewhere);

    try {
      renderMenu();
      fireEvent.click(trigger());
      screen.getByRole("button", { name: "Kirjaudu ulos" }).focus();

      fireEvent.pointerDown(elsewhere);
      elsewhere.focus(); // what the browser's click default action does next
      flushFocusRescue();

      expect(elsewhere).toHaveFocus();
    } finally {
      vi.useRealTimers();
      elsewhere.remove();
    }
  });

  it("leaves focus alone for a mouse reader who never entered the menu", () => {
    // Focus is on the trigger from the click that opened it, so the rescue
    // finds nothing orphaned and changes nothing.
    vi.useFakeTimers();
    try {
      renderMenu();
      fireEvent.click(trigger());

      fireEvent.pointerDown(document.body);
      flushFocusRescue();

      expect(screen.queryByRole("link", { name: "Asetukset" })).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the Ylläpito link", () => {
  it("is offered to an admin", async () => {
    renderMenu({ isAdmin: true });
    fireEvent.click(trigger());

    expect(screen.getByRole("link", { name: "Ylläpito" })).toHaveAttribute("href", "/yllapito");
  });

  it("is not rendered for a reader", async () => {
    renderMenu({ isAdmin: false });
    fireEvent.click(trigger());

    expect(screen.queryByRole("link", { name: "Ylläpito" })).toBeNull();
  });

  it("closes the menu when the link is followed", async () => {
    // Every other item does this, and a menu left open over the page it just
    // navigated to is the bug the shared `close(false)` exists to prevent.
    renderMenu({ isAdmin: true });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("link", { name: "Ylläpito" }));

    expect(screen.queryByRole("link", { name: "Ylläpito" })).toBeNull();
  });

  it("leaves the reader's own links alone either way", async () => {
    // The admin entry is an addition, not a replacement: a menu that lost
    // Suosikit or Asetukset when the role changed would be a regression nobody
    // is looking for.
    renderMenu({ isAdmin: true });
    fireEvent.click(trigger());

    expect(screen.getByRole("link", { name: "Suosikit" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Asetukset" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirjaudu ulos" })).toBeInTheDocument();
  });
});
