import type { PageKind, PageSections } from "@/lib/section-keys";

/**
 * A stand-in for `@/lib/section-choices` in a page's tests: a signed-out
 * reader's defaults, unless a test stores choices first. A test mocks the module
 * with `vi.mock("@/lib/section-choices", () => import("<this file>"))` and
 * resets it before each test.
 *
 * decisions/071-section-toggles.md
 */
export const storedSections: { signedIn: boolean; choices: Record<string, boolean> } = {
  signedIn: false,
  choices: {},
};

export async function getPageSections<K extends PageKind>(
  kind: K
): Promise<PageSections & { kind: K }> {
  return { kind, signedIn: storedSections.signedIn, choices: { ...storedSections.choices } };
}

export function resetStoredSections(): void {
  storedSections.signedIn = false;
  storedSections.choices = {};
}
