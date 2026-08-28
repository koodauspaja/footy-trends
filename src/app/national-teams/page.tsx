import type { Metadata } from "next";
import {
  CompetitionPicker,
  PICKER_HEADING,
  type PickerEntry,
} from "@/components/competition-picker";

export const metadata: Metadata = {
  title: PICKER_HEADING,
};

/**
 * Both national teams are TASO-backed and have no standings page, so neither
 * is in `SUPPORTED_COMPETITIONS` nor linked to `/sarjataulukko` like the two
 * football-data tournaments beside them. That list is football-data's and
 * feeds `kilpailu` validation. See specs/018-helmarit.md.
 */
const MENS_TEAM_ENTRY: PickerEntry = {
  key: "mens-team",
  name: "Huuhkajat",
  flagUrl: "/finland.svg",
  country: "Suomi",
  href: "/maajoukkueet/huuhkajat",
};

const WOMENS_TEAM_ENTRY: PickerEntry = {
  key: "womens-team",
  name: "Helmarit",
  flagUrl: "/finland.svg",
  country: "Suomi",
  href: "/maajoukkueet/helmarit",
};

export default function NationalTeams() {
  return (
    <CompetitionPicker
      basePath="/maajoukkueet"
      extraEntries={[MENS_TEAM_ENTRY, WOMENS_TEAM_ENTRY]}
      region="national-teams"
    />
  );
}
