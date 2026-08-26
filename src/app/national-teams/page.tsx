import type { Metadata } from "next";
import { CompetitionPicker, PICKER_HEADING } from "@/components/competition-picker";

export const metadata: Metadata = {
  title: PICKER_HEADING,
};

export default function NationalTeams() {
  return <CompetitionPicker basePath="/maajoukkueet" region="national-teams" />;
}
