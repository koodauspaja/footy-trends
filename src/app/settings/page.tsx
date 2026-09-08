import type { Metadata } from "next";
import { headers } from "next/headers";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { type Device, type RegionOptions, SettingsPage } from "@/components/settings-page";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { auth } from "@/lib/auth";
import { getAvatar } from "@/lib/avatar";
import { competitionOptionsFor, fallbackLabelFor } from "@/lib/competition-preferences";
import { logger } from "@/lib/logger";
import { NO_PREFERENCES, toPreferences } from "@/lib/regions";
import { currentPreferencesRow } from "@/lib/settings-actions";
import { describeDevice, describeLastUsed } from "@/lib/user-agent";

const HEADING = "Asetukset";

export const metadata: Metadata = { title: HEADING };

/**
 * Per-user by definition, so it can never be prerendered. Unlike the header,
 * this page reads its session on the server: everything it shows is server
 * data, and one render beats a client endpoint per section. See
 * specs/024-account-settings.md.
 */
export const dynamic = "force-dynamic";

export default async function Settings() {
  const requestHeaders = await headers();

  /**
   * The session lookup needs its own guard, not just the two below it. It
   * reads request headers and hits the database, and an unhandled failure here
   * rejects the whole route — an error page where the reader expected their
   * settings.
   *
   * A failure is not "signed out": prompting them to sign in would be a claim
   * we cannot make, and they may already be signed in. So it gets its own
   * state, like every other failure on this page.
   */
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch (error) {
    logger.error({ err: error }, "Reading the session on the settings page failed");
    return (
      <PageShell heading={HEADING}>
        <Notice>Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }

  if (!session) {
    return (
      <PageShell heading={HEADING}>
        <SignInPrompt />
      </PageShell>
    );
  }

  const row = await currentPreferencesRow();

  /**
   * A failed lookup is not "no preferences". Rendering defaults here would show
   * a reader their settings apparently reset, and a save would then overwrite
   * the real ones — losing settings because a query briefly failed. So the form
   * is withheld entirely rather than shown with wrong values.
   */
  if (row === "error") {
    return (
      <PageShell heading={HEADING}>
        <Notice>Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }

  const preferences = row === null ? NO_PREFERENCES : toPreferences(row);

  /**
   * `null` means the list could not be read, which is **not** the same as "one
   * device". Reporting an empty list would tell the reader nothing else is
   * signed in — a claim about their account security that we cannot back, and
   * that hides the very sessions the section exists to reveal.
   */
  let devices: Device[] | null = null;
  try {
    const sessions = await auth.api.listSessions({ headers: requestHeaders });
    devices = sessions.map((entry) => ({
      id: entry.id,
      // No IP address, deliberately: it reveals approximate location on a page
      // that gets screenshotted, and browser plus last-used is enough to
      // recognise a device you do not own.
      description: describeDevice(entry.userAgent ?? null),
      lastUsed: describeLastUsed(new Date(entry.updatedAt)),
      current: entry.token === session.session.token,
    }));
  } catch (error) {
    // The device list failing must not take the whole settings page with it —
    // the preferences are still editable without it.
    logger.error({ err: error }, "Listing sessions failed");
  }

  // Built here, on the server: the form may not import a competition registry.
  const regionOptions: RegionOptions[] = (
    [
      { region: "kotimaa", label: "Kotimaan oletussarja" },
      { region: "ulkomaat", label: "Ulkomaiden oletussarja" },
      { region: "maajoukkueet", label: "Maajoukkueiden oletuskilpailu" },
    ] as const
  ).map(({ region, label }) => ({
    region,
    label,
    fallbackLabel: fallbackLabelFor(region),
    options: competitionOptionsFor(region),
  }));

  /**
   * Which picture the reader is on, from specs/025-custom-avatar.md. Read on
   * the server like everything else here — the version is what the preview URL
   * carries, and a failure costs the section its picture rather than the page.
   */
  let avatarVersion: number | null = null;
  try {
    avatarVersion = (await getAvatar(session.user.id))?.version ?? null;
  } catch (error) {
    logger.error({ err: error }, "Reading the avatar on the settings page failed");
  }

  return (
    <PageShell heading={HEADING}>
      <SettingsPage
        avatarVersion={avatarVersion}
        devices={devices}
        googleImage={session.user.image ?? null}
        preferences={preferences}
        regionOptions={regionOptions}
      />
    </PageShell>
  );
}
