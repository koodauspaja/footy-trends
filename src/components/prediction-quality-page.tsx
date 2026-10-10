import { ChartPanel } from "@/components/charts/chart-panel";
import { formatDecimal, LineChart, LineLegend, percentText } from "@/components/charts/line-chart";
import { PageShell } from "@/components/page-shell";
import { SameRouteLink } from "@/components/same-route-link";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { canSeeAnalytics } from "@/lib/analytics-access";
import { getCompetitionName } from "@/lib/competitions";
import { getDomesticCompetitionName } from "@/lib/domestic-competitions";
import { ELO_MODEL } from "@/lib/elo";
import { HOME_BASELINE_MODEL } from "@/lib/home-baseline";
import type { MatchSource } from "@/lib/match-source";
import { POISSON_MODEL } from "@/lib/poisson";
import {
  type CalibrationBin,
  type QualityReport,
  type RollingPoint,
  SCORE_DECIMALS,
} from "@/lib/prediction-quality";
import {
  getPredictionQuality,
  type PredictionKind,
  type QualityResult,
  qualityCompetitions,
} from "@/lib/prediction-quality-service";
import { formatSeasonLabel } from "@/lib/seasons";

/**
 * The page's strings.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 * decisions/056-accuracy-by-competition.md
 */
export const QUALITY_HEADING = "Ennusteiden osuvuus";
export const QUALITY_INTRO =
  "Kuinka usein perustaso, Elo ja Poisson ovat ennustaneet ottelun lopputuloksen oikein, ja kuinka hyvin niiden todennäköisyydet ovat pitäneet paikkansa.";
export const BACKTEST_NOTE =
  "Jälkikäteen lasketut ennusteet on laskettu kustakin ottelusta vain sitä ennen pelattujen otteluiden perusteella.";
export const ACCURACY_HEADING = "Osumatarkkuus";
export const ACCURACY_NOTE =
  "Ennuste on oikein, kun todennäköisimmäksi arvioitu lopputulos toteutui.";
export const SCORES_HEADING = "Brier-pistemäärä ja log-loss";
export const BRIER_NOTE =
  "Brier-pistemäärä mittaa, kuinka kaukana ennustetut todennäköisyydet olivat toteutuneesta: 0 on täydellinen ja 2 huonoin.";
export const LOG_LOSS_NOTE = "Log-loss rankaisee erityisesti varmoista virheistä.";
export const YARDSTICK_NOTE =
  "Kummassakin pienempi on parempi: malli on sitä parempi, mitä pienempi sen luku on.";
export const CALIBRATION_HEADING = "Kalibrointi";
export const CALIBRATION_NOTE =
  "Hyvin kalibroitu malli osuu lävistäjälle: sen 70 prosentin ennusteista noin 70 % toteutuu.";
export const BINS_OMITTED_NOTE = "Väleistä, joissa on alle 50 ennustetta, ei piirretä pistettä.";
export const PERFECT_LABEL = "Täydellinen kalibrointi";
export const QUALITY_ERROR = "Ennusteiden osuvuutta ei voitu laskea. Yritä myöhemmin uudelleen.";
export const NO_JUDGED = "Ennusteita, joiden ottelu on jo pelattu, ei ole vielä.";
export const QUALITY_SIGNED_OUT = "Kirjaudu sisään nähdäksesi ennusteiden osuvuuden.";
export const BY_COMPETITION_HEADING = "Kilpailuittain";
export const BY_COMPETITION_NOTE =
  "Brier-pistemäärä kilpailuittain. Lihavoitu luku on kilpailun paras malli; pienempi on parempi.";
export const ALL_COMPETITIONS_LINK = "Kaikki kilpailut";

/**
 * Each model's name on the page.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 */
export const MODEL_LABELS: Record<string, string> = {
  [HOME_BASELINE_MODEL]: "Perustaso",
  [ELO_MODEL]: "Elo",
  [POISSON_MODEL]: "Poisson",
};

/**
 * A model's name on the page; its id where none is known.
 *
 * decisions/054-prediction-quality.md
 */
export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

/**
 * How a model's line is told from the others: the baseline, the yardstick,
 * dashed; Poisson dash-dotted; every other model solid.
 *
 * decisions/054-prediction-quality.md
 * decisions/055-poisson-goal-model.md
 */
const lineStyle = (model: string) => ({
  dashed: model === HOME_BASELINE_MODEL,
  dashDotted: model === POISSON_MODEL,
});

/**
 * `Liukuvaan osumatarkkuuteen tarvitaan …`: fewer than 200 judged matches.
 *
 * decisions/054-prediction-quality.md
 */
export function tooFewSentence(count: number): string {
  return `Liukuvaan osumatarkkuuteen tarvitaan vähintään 200 ottelua; nyt niitä on ${count}.`;
}

/**
 * `1 520`: a count of matches, as Finnish groups its thousands.
 *
 * decisions/056-accuracy-by-competition.md
 */
const matchCount = new Intl.NumberFormat("fi-FI");

/**
 * The window line, from the data.
 *
 * decisions/054-prediction-quality.md
 */
export function windowSentence(matches: number, firstYear: number, lastYear: number): string {
  const years =
    firstYear === lastYear ? `vuodelta ${firstYear}` : `vuosilta ${firstYear}–${lastYear}`;
  return `${matchCount.format(matches)} ottelua ${years}, joille kaikki mallit ovat antaneet ennusteen.`;
}

/**
 * `Näytetään vain kilpailu …`: the page counts one competition's matches.
 *
 * decisions/056-accuracy-by-competition.md
 */
export function filteredSentence(name: string): string {
  return `Näytetään vain kilpailu ${name}.`;
}

/**
 * `0,601`: three decimals with a comma.
 *
 * decisions/054-prediction-quality.md
 */
const score = (value: number) => formatDecimal(value, SCORE_DECIMALS);

/**
 * The page's parameters, as Next gives them: `alue`, `tyyppi` and `kilpailu`,
 * the defaults `kotimaa`, backtest and every competition. A repeated one is an
 * array, and falls back, as does a `kilpailu` that is not one of the
 * provider's compared competitions.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */
export type QualityParams = Record<string, string | string[] | undefined>;

export function parseQualityParams(params: QualityParams): {
  source: MatchSource["kind"];
  kind: PredictionKind;
  competition: string | null;
} {
  const source = params.alue === "ulkomaat" ? "football-data" : "taso";
  const named = params.kilpailu;
  return {
    source,
    kind: params.tyyppi === "ennakkoon" ? "live" : "backtest",
    competition:
      typeof named === "string" && qualityCompetitions(source).includes(named) ? named : null,
  };
}

function hrefFor(
  source: MatchSource["kind"],
  kind: PredictionKind,
  competition: string | null = null
): string {
  const regionSlug = source === "taso" ? "kotimaa" : "ulkomaat";
  const kindSlug = kind === "backtest" ? "jalkikateen" : "ennakkoon";
  const filter = competition === null ? "" : `&kilpailu=${competition}`;
  return `/ennusteet?alue=${regionSlug}&tyyppi=${kindSlug}${filter}`;
}

function competitionName(source: MatchSource["kind"], code: string): string {
  return source === "taso" ? getDomesticCompetitionName(code) : getCompetitionName(code);
}

function Switch({
  options,
}: Readonly<{ options: ReadonlyArray<{ label: string; href: string; current: boolean }> }>) {
  return (
    <ul className="flex gap-4 text-sm">
      {options.map((option) => (
        <li key={option.label}>
          <SameRouteLink
            aria-current={option.current ? "page" : undefined}
            className={option.current ? "font-semibold" : "text-muted hover:underline"}
            href={option.href}
          >
            {option.label}
          </SameRouteLink>
        </li>
      ))}
    </ul>
  );
}

function RollingChart({
  lines,
}: Readonly<{ lines: ReadonlyArray<{ model: string; points: RollingPoint[] }> }>) {
  const all = lines.flatMap((line) => line.points);
  const low = Math.floor(Math.min(...all.map((point) => point.accuracy)) / 10) * 10;
  const high = Math.ceil(Math.max(...all.map((point) => point.accuracy)) / 10) * 10;
  const first = Math.min(...all.map((point) => point.at));
  const last = Math.max(...all.map((point) => point.at));
  const firstYear = new Date(first).getUTCFullYear();
  const lastYear = new Date(last).getUTCFullYear();
  const yearTicks = Array.from({ length: lastYear - firstYear + 1 }, (_, index) =>
    Date.UTC(firstYear + index, 0, 1)
  ).filter((tick) => tick >= first && tick <= last);
  // Never a zero-height axis, even if every point is equal.
  const top = Math.max(high, low + 10);
  const yTicks = Array.from({ length: (top - low) / 10 + 1 }, (_, index) => low + index * 10);
  const textId = "quality-rolling-text";
  return (
    <div>
      <LineChart
        describedBy={textId}
        formatXTick={(tick) => String(new Date(tick).getUTCFullYear())}
        formatYTick={String}
        labelledBy="quality-accuracy"
        series={lines.map((line) => ({
          name: line.model,
          ...lineStyle(line.model),
          dots: false,
          points: line.points.map((point) => ({ x: point.at, y: point.accuracy })),
        }))}
        thinXTicksOnPhone
        title={ACCURACY_HEADING}
        xDomain={[first, last]}
        xLabel="Vuosi"
        xTicks={yearTicks}
        yDomain={[low, top]}
        yLabel="Osuma-% (200 viimeisintä)"
        yTicks={yTicks}
      />
      <LineLegend
        items={lines.map((line) => ({ label: modelLabel(line.model), ...lineStyle(line.model) }))}
      />
      <ul className="sr-only" id={textId}>
        {lines.map((line) => (
          <li key={line.model}>
            {`${modelLabel(line.model)}: ${percentText((line.points.at(-1) as RollingPoint).accuracy)}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalibrationChart({
  lines,
}: Readonly<{ lines: ReadonlyArray<{ model: string; bins: CalibrationBin[] }> }>) {
  const ticks = [0, 20, 40, 60, 80, 100];
  const textId = "quality-calibration-text";
  const drawn = (bins: readonly CalibrationBin[]) =>
    bins.flatMap((bin) =>
      bin.observed === null ? [] : [{ from: bin.from, observed: bin.observed }]
    );
  return (
    <div>
      <LineChart
        describedBy={textId}
        labelledBy="quality-calibration"
        series={[
          {
            name: "perfect",
            dotted: true,
            dots: false,
            points: [
              { x: 0, y: 0 },
              { x: 100, y: 100 },
            ],
          },
          ...lines.map((line) => ({
            name: line.model,
            ...lineStyle(line.model),
            points: drawn(line.bins).map((bin) => ({ x: bin.from + 5, y: bin.observed })),
          })),
        ]}
        title={CALIBRATION_HEADING}
        xDomain={[0, 100]}
        xLabel="Ennustettu todennäköisyys (%)"
        xTicks={ticks}
        yDomain={[0, 100]}
        yLabel="Toteutunut osuus (%)"
        yTicks={ticks}
      />
      <LineLegend
        items={[
          { label: PERFECT_LABEL, dotted: true },
          ...lines.map((line) => ({ label: modelLabel(line.model), ...lineStyle(line.model) })),
        ]}
      />
      <ul className="sr-only" id={textId}>
        {lines.map((line) => (
          <li key={line.model}>
            {`${modelLabel(line.model)}: ${drawn(line.bins)
              .map((bin) => `${bin.from}–${bin.from + 10} %: ${percentText(bin.observed)}`)
              .join(", ")}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompetitionTable({
  report,
  source,
  kind,
  competition,
}: Readonly<{
  report: Extract<QualityReport, { status: "ok" }>;
  source: MatchSource["kind"];
  kind: PredictionKind;
  competition: string | null;
}>) {
  return (
    <table className="text-sm">
      <thead>
        <tr className="border-border border-b text-muted">
          <th className="py-2 pr-2 text-left sm:pr-4 font-medium" scope="col">
            Kilpailu
          </th>
          <th className="py-2 pl-2 text-right sm:pl-4 font-medium" scope="col">
            Ottelut
          </th>
          {report.models.map((model) => (
            <th className="py-2 pl-2 text-right sm:pl-4 font-medium" key={model} scope="col">
              {modelLabel(model)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {report.competitions.map((row) => (
          <tr className="border-border border-b" key={row.code}>
            <th className="py-2 pr-2 text-left sm:pr-4 font-normal" scope="row">
              <SameRouteLink
                aria-current={row.code === competition ? "page" : undefined}
                className={row.code === competition ? "font-semibold" : "underline"}
                href={hrefFor(source, kind, row.code)}
              >
                {competitionName(source, row.code)}
              </SameRouteLink>
            </th>
            <td className="py-2 pl-2 text-right sm:pl-4 tabular-nums">
              {matchCount.format(row.matches)}
            </td>
            {row.brier.map((value, index) => (
              <td className="py-2 pl-2 text-right sm:pl-4 tabular-nums" key={report.models[index]}>
                {row.best[index] ? <strong>{score(value)}</strong> : score(value)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Report({
  report,
  source,
  kind,
  competition,
}: Readonly<{
  report: Extract<QualityReport, { status: "ok" }>;
  source: MatchSource["kind"];
  kind: PredictionKind;
  competition: string | null;
}>) {
  return (
    <div>
      <p className="mt-4 text-muted text-sm">
        {windowSentence(report.matches, report.firstYear, report.lastYear)}
      </p>
      {kind === "backtest" ? <p className="mt-1 text-muted text-sm">{BACKTEST_NOTE}</p> : null}

      <ChartPanel heading={ACCURACY_HEADING} headingId="quality-accuracy">
        <p className="mb-2">
          {report.totals
            .map((total) => `${modelLabel(total.model)} ${percentText(total.accuracy)}`)
            .join(" · ")}
        </p>
        {report.rolling === null ? (
          <p>{tooFewSentence(report.matches)}</p>
        ) : (
          <RollingChart lines={report.rolling} />
        )}
        <p className="mt-2 text-muted text-sm">{ACCURACY_NOTE}</p>
      </ChartPanel>

      <ChartPanel heading={SCORES_HEADING} headingId="quality-scores">
        <table className="text-sm">
          <thead>
            <tr className="border-border border-b text-muted">
              <th className="py-2 pr-4 text-left font-medium" scope="col">
                Malli
              </th>
              <th className="py-2 pl-4 text-right font-medium" scope="col">
                Brier
              </th>
              <th className="py-2 pl-4 text-right font-medium" scope="col">
                Log-loss
              </th>
            </tr>
          </thead>
          <tbody>
            {report.totals.map((total) => (
              <tr className="border-border border-b" key={total.model}>
                <th className="py-2 pr-4 text-left font-semibold" scope="row">
                  {modelLabel(total.model)}
                </th>
                <td className="py-2 pl-4 text-right tabular-nums">{score(total.brier)}</td>
                <td className="py-2 pl-4 text-right tabular-nums">{score(total.logLoss)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="mt-4 text-sm">
          <thead>
            <tr className="border-border border-b text-muted">
              <th className="py-2 pr-4 text-left font-medium" scope="col">
                Kausi
              </th>
              <th className="py-2 pl-4 text-right font-medium" scope="col">
                Ottelut
              </th>
              {report.models.map((model) => (
                <th className="py-2 pl-4 text-right font-medium" key={model} scope="col">
                  {modelLabel(model)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.seasons.map((season) => (
              <tr className="border-border border-b" key={season.seasonId}>
                <th className="py-2 pr-4 text-left font-normal" scope="row">
                  {formatSeasonLabel(season.seasonId, source === "football-data")}
                </th>
                <td className="py-2 pl-4 text-right tabular-nums">{season.matches}</td>
                {season.brier.map((value, index) => (
                  <td className="py-2 pl-4 text-right tabular-nums" key={report.models[index]}>
                    {score(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-muted text-sm">{BRIER_NOTE}</p>
        <p className="mt-1 text-muted text-sm">{LOG_LOSS_NOTE}</p>
        <p className="mt-1 text-muted text-sm">{YARDSTICK_NOTE}</p>
      </ChartPanel>

      <ChartPanel heading={CALIBRATION_HEADING} headingId="quality-calibration">
        <CalibrationChart lines={report.calibration} />
        <p className="mt-2 text-muted text-sm">{CALIBRATION_NOTE}</p>
        {report.binsOmitted ? <p className="mt-1 text-muted text-sm">{BINS_OMITTED_NOTE}</p> : null}
      </ChartPanel>

      <ChartPanel heading={BY_COMPETITION_HEADING} headingId="quality-competitions">
        <CompetitionTable competition={competition} kind={kind} report={report} source={source} />
        <p className="mt-2 text-muted text-sm">{BY_COMPETITION_NOTE}</p>
      </ChartPanel>
    </div>
  );
}

function Body({
  result,
  source,
  kind,
  competition,
}: Readonly<{
  result: QualityResult;
  source: MatchSource["kind"];
  kind: PredictionKind;
  competition: string | null;
}>) {
  if (result.status === "error") return <p className="mt-4">{QUALITY_ERROR}</p>;
  if (result.status === "empty") return <p className="mt-4">{NO_JUDGED}</p>;
  return <Report competition={competition} kind={kind} report={result} source={source} />;
}

/**
 * `/ennusteet`: the models judged against the results, one
 * provider and one kind at a time, over all its competitions or one. Signed in
 * only, the gate asked before anything is read.
 *
 * decisions/054-prediction-quality.md
 * decisions/056-accuracy-by-competition.md
 */
export async function PredictionQualityPage({ params }: Readonly<{ params: QualityParams }>) {
  const { source, kind, competition } = parseQualityParams(params);
  if (!(await canSeeAnalytics())) {
    return (
      <PageShell heading={QUALITY_HEADING}>
        <SignInPrompt message={QUALITY_SIGNED_OUT} />
      </PageShell>
    );
  }
  const result = await getPredictionQuality(source, kind, competition);
  return (
    <PageShell heading={QUALITY_HEADING}>
      <p className="mb-4">{QUALITY_INTRO}</p>
      <div className="flex flex-col gap-2">
        <Switch
          options={[
            { label: "Kotimaa", href: hrefFor("taso", kind), current: source === "taso" },
            {
              label: "Ulkomaat",
              href: hrefFor("football-data", kind),
              current: source === "football-data",
            },
          ]}
        />
        <Switch
          options={[
            {
              label: "Jälkikäteen lasketut",
              href: hrefFor(source, "backtest", competition),
              current: kind === "backtest",
            },
            {
              label: "Ennakkoon tehdyt",
              href: hrefFor(source, "live", competition),
              current: kind === "live",
            },
          ]}
        />
      </div>
      {competition === null ? null : (
        <p className="mt-4 text-sm">
          {filteredSentence(competitionName(source, competition))}{" "}
          <SameRouteLink className="underline" href={hrefFor(source, kind)}>
            {ALL_COMPETITIONS_LINK}
          </SameRouteLink>
        </p>
      )}
      <Body competition={competition} kind={kind} result={result} source={source} />
    </PageShell>
  );
}
