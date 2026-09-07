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
      if (!containerRef.current?.contains(event.target as Node)) close(false);
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
          <span className="text-zinc-600">{name}</span>
        ) : (
          // Empty alt: the button is already named by `aria-label`, and
          // repeating the reader's name would just be noise.
          // biome-ignore lint/performance/noImgElement: a Google avatar is an arbitrary remote host; next/image would need it allowlisted in next.config.ts to render a 28px image
          <img alt="" className="h-7 w-7 rounded-full" src={image} />
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-10 mt-2 min-w-44 rounded border border-zinc-200 bg-white py-1 shadow-sm"
          id={menuId}
        >
          <Link
            className="block px-4 py-2 text-sm hover:bg-zinc-50"
            href="/asetukset"
            onClick={() => close(false)}
          >
            Asetukset
          </Link>
          <button
            className="block w-full px-4 py-2 text-left text-sm hover:bg-zinc-50"
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
