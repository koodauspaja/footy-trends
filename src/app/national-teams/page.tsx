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
 * Huuhkajat is TASO-backed and has no standings page, so it is neither in
 * `SUPPORTED_COMPETITIONS` nor linked to `/sarjataulukko` like the two
 * football-data tournaments beside it. See specs/017-huuhkajat.md.
 */
const HUUHKAJAT: PickerEntry = {
  key: "huuhkajat",
  name: "Huuhkajat",
  flagUrl: "/finland.svg",
  country: "Suomi",
  href: "/maajoukkueet/huuhkajat",
};

export default function NationalTeams() {
  return (
    <CompetitionPicker
      basePath="/maajoukkueet"
      extraEntries={[HUUHKAJAT]}
      region="national-teams"
    />
  );
}
