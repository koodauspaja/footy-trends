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
 * Per-user, so it can never be prerendered. Unlike the header, this page reads
 * its session on the server.
 *
 * decisions/024-account-settings.md
 */
export const dynamic = "force-dynamic";

/**
 * `/asetukset`: the reader's preferences, devices and picture, each read on
 * the server and each with its own failure state.
 *
 * decisions/024-account-settings.md
 * decisions/025-custom-avatar.md
 */
export default async function Settings() {
  const requestHeaders = await headers();

  // The session lookup has its own guard and its own state: a failure is not
  // "signed out".
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

  // A failed lookup is not "no preferences": the form is withheld, not shown
  // with defaults a save would then write over the real ones.
  if (row === "error") {
    return (
      <PageShell heading={HEADING}>
        <Notice>Asetusten lataaminen epäonnistui. Yritä myöhemmin uudelleen.</Notice>
      </PageShell>
    );
  }

  const preferences = row === null ? NO_PREFERENCES : toPreferences(row);

  // `null` means the list could not be read, which is not the same as "one
  // device".
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

  // Which picture the reader is on. A failure costs the section its picture,
  // not the page.
  let avatarVersion: string | null = null;
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
