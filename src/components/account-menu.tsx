"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = Readonly<{
  name: string;
  image: string | null;
  onSignOut: () => void;
}>;

/**
 * The signed-in reader's account menu, from specs/024-account-settings.md.
 *
 * `Kirjaudu ulos` moved in here from beside the name. Three controls in that
 * header row is what overflowed a 320px viewport in #266, and account actions
 * are where a reader looks for them anyway.
 *
 * Click, not hover: a hover menu is unreachable on the phones #266 was about.
 */
export function AccountMenu({ name, image, onSignOut }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // Focus goes back to the trigger only when the menu was dismissed, not when
    // a link inside it navigated: stealing focus back mid-navigation would drop
    // a keyboard reader at the top of the header on every visit.
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;

      /**
       * Rescue focus only if it would otherwise be orphaned.
       *
       * A keyboard reader who tabs into the menu and then clicks empty space
       * leaves focus on an element that is about to unmount, and it falls to
       * `<body>` — measured, not assumed. But forcing focus back on *every*
       * outside click would fight a reader who clicked a different control: the
       * click is itself a focus request, and overriding it is the anti-pattern
       * this avoids.
       *
       * So: close now, and after the click has settled, restore only if focus
       * ended up on `<body>` — which is exactly the orphaned case, and is
       * false whenever the reader's click gave focus to something else. Asking
       * afterwards needs no "was focus inside" bookkeeping, and no guard for a
       * ref that cannot be null while the menu is open.
       *
       * A timeout rather than a microtask because the browser moves focus as
       * part of the click's default action, which has not happened yet when
       * this handler runs.
       */
      close(false);

      setTimeout(() => {
        if (document.activeElement === document.body) close(true);
      }, 0);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  return (
    <div className="relative" ref={containerRef}>
      {/*
        A disclosure, not an ARIA menu. Real `role="menu"` semantics promise
        arrow-key navigation and typeahead that this does not implement, and
        claiming them is worse for a screen reader than not claiming them.
        `aria-expanded` plus `aria-controls` describes what this actually is.

        `aria-label` names the trigger in both branches, so the avatar case is
        never an unlabelled button. It contains the visible name in the
        text branch, which is what WCAG 2.5.3 (Label in Name) asks for.
      */}
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-label={`Tili: ${name}`}
        className="flex shrink-0 items-center gap-2 rounded text-sm hover:underline"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        ref={triggerRef}
        type="button"
      >
        {image === null ? (
          // No avatar to show, so the name is the control. An image that cannot
          // load must never leave an unlabelled button behind.
          <span className="text-foreground">{name}</span>
        ) : (
          // Empty alt: the button is already named by `aria-label`, and
          // repeating the reader's name would just be noise.
          // biome-ignore lint/performance/noImgElement: a Google avatar is an arbitrary remote host; next/image would need it allowlisted in next.config.ts to render a 28px image
          <img alt="" className="h-7 w-7 rounded-full" src={image} />
        )}
      </button>

      {open && (
        <div
          /**
           * `bg-background text-foreground`, not `bg-background`. Those two tokens
           * are the ones `globals.css` flips under `prefers-color-scheme`, and
           * `body` already uses them — so the panel and its contents move
           * together. Hardcoding a white surface while the text followed the
           * theme is what left this at 1.17:1 in dark mode (#273).
           *
           * The border and hover are alpha tints of a mid grey rather than
           * fixed light greys, so they read against either background without
           * a second colour scheme to maintain. See #269 for the app-wide
           * version of this problem.
           */
          className="absolute right-0 z-10 mt-2 min-w-44 rounded border border-border bg-background py-1 text-foreground shadow-sm"
          id={menuId}
        >
          <Link
            className="block px-4 py-2 text-sm hover:bg-surface"
            href="/asetukset"
            onClick={() => close(false)}
          >
            Asetukset
          </Link>
          <button
            className="block w-full px-4 py-2 text-left text-sm hover:bg-surface"
            onClick={() => {
              close(false);
              onSignOut();
            }}
            type="button"
          >
            Kirjaudu ulos
          </button>
        </div>
      )}
    </div>
  );
}
