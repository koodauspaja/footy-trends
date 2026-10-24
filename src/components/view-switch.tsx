import { SameRouteLink } from "@/components/same-route-link";

/**
 * A switch between views of one page: a bordered group of links, the chosen
 * one filled and marked `aria-current`.
 *
 * decisions/054-prediction-quality.md
 * decisions/701-links-and-switches.md
 */
export function ViewSwitch({
  options,
}: Readonly<{ options: ReadonlyArray<{ label: string; href: string; current: boolean }> }>) {
  return (
    <ul className="flex w-fit divide-x divide-border overflow-hidden rounded border border-border text-sm">
      {options.map((option) => (
        <li key={option.label}>
          <SameRouteLink
            aria-current={option.current ? "page" : undefined}
            className={`block px-3 py-1 no-underline ${option.current ? "bg-foreground text-background" : "hover:bg-surface"}`}
            href={option.href}
          >
            {option.label}
          </SameRouteLink>
        </li>
      ))}
    </ul>
  );
}
