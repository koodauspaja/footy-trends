import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 px-4 py-3 sm:px-8">
      <Link className="text-sm hover:underline" href="/">
        Etusivu
      </Link>
    </header>
  );
}
