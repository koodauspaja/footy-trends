import type { Metadata } from "next";
import {
  PredictionQualityPage,
  QUALITY_HEADING,
  type QualityParams,
} from "@/components/prediction-quality-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: QUALITY_HEADING };

/** `/ennusteet` — how good the predictions have been (specs/054). */
export default async function PredictionsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<QualityParams> }>) {
  return PredictionQualityPage({ params: await searchParams });
}
