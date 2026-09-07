import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "@/components/account-menu";

const onSignOut = vi.fn();

function renderMenu(overrides: { name?: string; image?: string | null } = {}) {
  return render(
    <AccountMenu
      image={overrides.image ?? null}
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
});
