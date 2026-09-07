import type { Metadata } from "next";
import { headers } from "next/headers";
import { PageShell } from "@/components/page-shell";
import { type RegionOptions, SettingsPage } from "@/components/settings-page";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    return (
      <PageShell heading={HEADING}>
        <SignInPrompt />
      </PageShell>
    );
  }

  const row = await currentPreferencesRow();
  const preferences = row === null ? NO_PREFERENCES : toPreferences(row);

  let devices: Array<{ id: string; description: string; lastUsed: string; current: boolean }> = [];
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
    // the preferences below are still editable without it.
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

  return (
    <PageShell heading={HEADING}>
      <SettingsPage devices={devices} preferences={preferences} regionOptions={regionOptions} />
    </PageShell>
  );
}
