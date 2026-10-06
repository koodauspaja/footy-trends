import type { ReactNode } from "react";

type SeasonFormProps = {
  actionPath: string;
  competitionCode: string;
  children: ReactNode;
};

/**
 * The `<form>`, hidden `kilpailu` field and no-JS submit button shared by every
 * selector control with no visible `Kilpailu` select of its own. A plain GET
 * form.
 *
 * decisions/009-veikkausliiga.md
 */
export function SeasonForm({ actionPath, competitionCode, children }: Readonly<SeasonFormProps>) {
  return (
    <form action={actionPath} method="get" className="mb-6 flex flex-wrap items-center gap-3">
      <input type="hidden" name="kilpailu" value={competitionCode} />
      {children}
      <noscript>
        <button className="rounded border border-border px-3 py-2" type="submit">
          Näytä
        </button>
      </noscript>
    </form>
  );
}
