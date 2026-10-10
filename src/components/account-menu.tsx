"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Props = Readonly<{
  name: string;
  image: string | null;
  /**
   * Whether to offer `Ylläpito`. A convenience, not a control: `requireAdmin()`
   * refuses at the page and at every action.
   */
  isAdmin: boolean;
  onSignOut: () => void;
}>;

/**
 * The signed-in reader's account menu, opened by a click.
 *
 * decisions/024-account-settings.md
 * decisions/026-favourites.md
 * decisions/028-admin-tools-and-roles.md
 * decisions/269-colour-roles.md
 */
export function AccountMenu({ name, image, isAdmin, onSignOut }: Props) {
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

      // Close now, and once the click has settled restore focus to the trigger only
      // if it ended up on `<body>`: orphaned, not given to another control.
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
      {/* A disclosure, not an ARIA menu: `aria-expanded` and `aria-controls` say what
          this is, and `aria-label` names the trigger in both branches. */}
      <button
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-label={`Tili: ${name}`}
        className="flex items-center gap-2 rounded text-sm hover:underline"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        ref={triggerRef}
        type="button"
      >
        {image === null ? (
          // No avatar to show, so the name is the control. An image that cannot
          // load must never leave an unlabelled button behind.
          <span className="wrap-anywhere text-foreground">{name}</span>
        ) : (
          // Empty alt: the button is already named by `aria-label`, and
          // repeating the reader's name would just be noise.
          // biome-ignore lint/performance/noImgElement: a Google avatar is an arbitrary remote host; next/image would need it allowlisted in next.config.ts to render a 28px image
          <img alt="" className="h-7 w-7 shrink-0 rounded-full" src={image} />
        )}
      </button>

      {open && (
        <div
          // Theme roles, not pinned colours, so the panel and its contents follow the
          // scheme together.
          className="absolute right-0 z-10 mt-2 min-w-44 rounded border border-border bg-background py-1 text-foreground shadow-sm"
          id={menuId}
        >
          {/* Above `Asetukset`, so the reader's own things sit together. */}
          <Link
            className="block px-4 py-2 text-sm hover:bg-surface"
            href="/suosikit"
            onClick={() => close(false)}
          >
            Suosikit
          </Link>
          <Link
            className="block px-4 py-2 text-sm hover:bg-surface"
            href="/asetukset"
            onClick={() => close(false)}
          >
            Asetukset
          </Link>
          {/* Last of the links, because it is the least used and belongs to a
              different job than the reader's own two. */}
          {isAdmin && (
            <Link
              className="block px-4 py-2 text-sm hover:bg-surface"
              href="/yllapito"
              onClick={() => close(false)}
            >
              Ylläpito
            </Link>
          )}
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
