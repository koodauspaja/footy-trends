/**
 * How each section of each kind of page starts for a reader with no stored
 * choice, by a stable English key: the page's most basic part open
 * (decisions/714), everything else closed, and the groups inside `Analyysit`
 * open except `Kilpailut rinnakkain`. Its keys are the only sections a choice
 * can be stored for.
 *
 * decisions/071-section-toggles.md
 */
const DEFAULT_OPEN = {
  team: {
    matches: true,
    analytics: false,
    "analytics-summary": true,
    "analytics-by-match": true,
    "analytics-whole-season": true,
    "analytics-other-seasons": true,
    "analytics-opponents": true,
  },
  "national-team": {
    analytics: false,
    "analytics-summary": true,
    "analytics-by-match": true,
    "analytics-whole-season": true,
    "analytics-other-seasons": true,
    "analytics-opponents": true,
  },
  standings: {
    knockout: false,
    "cup-forecast": false,
    analytics: false,
    "analytics-this-season": true,
    "analytics-season-by-season": true,
    "analytics-side-by-side": false,
  },
} as const;

export type PageKind = keyof typeof DEFAULT_OPEN;

/**
 * One kind of page's sections, the keys `DEFAULT_OPEN` gives it.
 *
 * decisions/071-section-toggles.md
 */
export type SectionKey<K extends PageKind> = keyof (typeof DEFAULT_OPEN)[K];

/**
 * A reader's stored choices on one kind of page, by section.
 *
 * decisions/071-section-toggles.md
 */
export type SectionChoices = Readonly<Partial<Record<string, boolean>>>;

/**
 * What a page knows about its reader's sections: the stored choices, and
 * whether toggling one saves it, which only a signed-in reader's does.
 *
 * decisions/071-section-toggles.md
 */
export type PageSections = Readonly<{
  kind: PageKind;
  signedIn: boolean;
  choices: SectionChoices;
}>;

/**
 * Whether `section` is one a choice can be stored for on `kind`. It takes
 * anything, because a server action's arguments are whatever the request sent.
 *
 * decisions/071-section-toggles.md
 */
export function isKnownSection(kind: unknown, section: unknown): kind is PageKind {
  return (
    typeof kind === "string" &&
    typeof section === "string" &&
    Object.hasOwn(DEFAULT_OPEN, kind) &&
    Object.hasOwn(DEFAULT_OPEN[kind as PageKind], section)
  );
}

/**
 * Whether a section renders open: the reader's stored choice, else its
 * default. `first` marks the page's first section, its most basic part, which
 * opens whatever its kind's default, as `Pudotuspelit` does on a Suomen Cup.
 *
 * decisions/071-section-toggles.md
 */
export function sectionOpen<K extends PageKind>(
  sections: PageSections & { kind: K },
  section: SectionKey<K>,
  first = false
): boolean {
  const key = section as string;
  const stored = sections.choices[key];
  if (stored !== undefined) return stored;
  return first || (DEFAULT_OPEN[sections.kind] as Readonly<Record<string, boolean>>)[key] === true;
}

/**
 * How a fold starts, and what it saves when toggled: nothing for a signed-out
 * reader, or for a fold that is never remembered.
 *
 * decisions/071-section-toggles.md
 */
export type FoldState = Readonly<{
  initiallyOpen: boolean;
  remember: { kind: PageKind; section: string } | null;
}>;

/**
 * A fold's state for `section`, from the reader's choices and its default.
 *
 * decisions/071-section-toggles.md
 */
export function foldFor<K extends PageKind>(
  sections: PageSections & { kind: K },
  section: SectionKey<K>,
  first = false
): FoldState {
  return {
    initiallyOpen: sectionOpen(sections, section, first),
    remember: sections.signedIn ? { kind: sections.kind, section: section as string } : null,
  };
}

/**
 * The sections of a page whose reader is unknown: no choices, nothing saved.
 *
 * decisions/071-section-toggles.md
 */
export function defaultSections<K extends PageKind>(kind: K): PageSections & { kind: K } {
  return { kind, signedIn: false, choices: {} };
}
