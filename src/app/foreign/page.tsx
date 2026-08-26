import type { Metadata } from "next";
import { CompetitionPicker, PICKER_HEADING } from "@/components/competition-picker";

export const metadata: Metadata = {
  title: PICKER_HEADING,
};

export default function Foreign() {
  return <CompetitionPicker basePath="/ulkomaat" region="foreign" />;
}
