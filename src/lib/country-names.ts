import type { CompetitionRegion } from "./competitions";

/**
 * Finnish names for the national teams football-data.org reports in English.
 *
 * Covers every country appearing in World Cup 2026 and Euro 2024, which is the
 * full set the app can currently reach through that provider. See
 * specs/016-world-cup-and-euro.md.
 *
 * TASO needs its own map — `FINNISH_TASO_TEAM_NAMES` below — and not this one.
 * An earlier version of this comment claimed TASO publishes Finnish names
 * throughout and that the national-team pages would get them for free. That is
 * true of most of it and wrong in the corner that matters; see there.
 */
const FINNISH_COUNTRY_NAMES: Record<string, string> = {
  Albania: "Albania",
  Algeria: "Algeria",
  Argentina: "Argentiina",
  Australia: "Australia",
  Austria: "Itävalta",
  Belgium: "Belgia",
  "Bosnia-Herzegovina": "Bosnia ja Hertsegovina",
  Brazil: "Brasilia",
  Canada: "Kanada",
  "Cape Verde Islands": "Kap Verde",
  Colombia: "Kolumbia",
  "Congo DR": "Kongon demokraattinen tasavalta",
  Croatia: "Kroatia",
  Curaçao: "Curaçao",
  Czechia: "Tšekki",
  Denmark: "Tanska",
  Ecuador: "Ecuador",
  Egypt: "Egypti",
  England: "Englanti",
  France: "Ranska",
  Georgia: "Georgia",
  Germany: "Saksa",
  Ghana: "Ghana",
  Haiti: "Haiti",
  Hungary: "Unkari",
  Iran: "Iran",
  Iraq: "Irak",
  Italy: "Italia",
  "Ivory Coast": "Norsunluurannikko",
  Japan: "Japani",
  Jordan: "Jordania",
  Mexico: "Meksiko",
  Morocco: "Marokko",
  Netherlands: "Alankomaat",
  "New Zealand": "Uusi-Seelanti",
  Norway: "Norja",
  Panama: "Panama",
  Paraguay: "Paraguay",
  Poland: "Puola",
  Portugal: "Portugali",
  Qatar: "Qatar",
  Romania: "Romania",
  "Saudi Arabia": "Saudi-Arabia",
  Scotland: "Skotlanti",
  Senegal: "Senegal",
  Serbia: "Serbia",
  Slovakia: "Slovakia",
  Slovenia: "Slovenia",
  "South Africa": "Etelä-Afrikka",
  "South Korea": "Etelä-Korea",
  Spain: "Espanja",
  Sweden: "Ruotsi",
  Switzerland: "Sveitsi",
  Tunisia: "Tunisia",
  Turkey: "Turkki",
  Ukraine: "Ukraina",
  "United States": "Yhdysvallat",
  Uruguay: "Uruguay",
  Uzbekistan: "Uzbekistan",
};

/**
 * Finnish names for the handful of national teams TASO reports in English.
 *
 * TASO is *mostly* Finnish, which is exactly what made this easy to miss:
 * every `maajp{YYYY}` bucket is Finnish throughout, and only the older
 * `maajp18` content — the 2019 Euro qualifiers and the 2020 Nations League —
 * carries English. Eight rows, four countries.
 *
 * Mapped to the spelling **TASO itself uses elsewhere**, not to
 * `FINNISH_COUNTRY_NAMES`'s. That map says `Bosnia ja Hertsegovina` while
 * TASO's own Finnish rows say `Bosnia-Hertsegovina`, and one country must not
 * read two ways on a single page — which is the whole defect being fixed here,
 * since `Greece` and `Kreikka` were both appearing.
 *
 * Helmarit (#167) reads the same buckets and will need this too; add any
 * further English names here rather than starting a second map.
 */
const FINNISH_TASO_TEAM_NAMES: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia-Hertsegovina",
  Greece: "Kreikka",
  Italy: "Italia",
  "Republic of Ireland": "Irlanti",
};

/** A TASO team name in Finnish, unchanged when it already is. */
export function toFinnishTasoTeamName(tasoName: string): string {
  return FINNISH_TASO_TEAM_NAMES[tasoName] ?? tasoName;
}

/** Both sides of every match, with any English TASO name replaced. */
export function toFinnishTasoTeamNames<T extends { homeTeamName: string; awayTeamName: string }>(
  matches: T[]
): T[] {
  return matches.map((match) => ({
    ...match,
    homeTeamName: toFinnishTasoTeamName(match.homeTeamName),
    awayTeamName: toFinnishTasoTeamName(match.awayTeamName),
  }));
}

/**
 * A national team's Finnish name, or the provider's own name where there is no
 * translation.
 *
 * Falling through rather than guessing: a country that qualifies later shows
 * under its English name, which is wrong but readable, where a mangled
 * translation would be neither. Add it to the map instead.
 *
 * Applied only to national-team competitions. Club names are proper nouns and
 * are never translated — `Paris Saint-Germain` stays as it is.
 */
export function toFinnishCountryName(providerName: string): string {
  return FINNISH_COUNTRY_NAMES[providerName] ?? providerName;
}

/**
 * A match list with both team names in Finnish.
 *
 * Applied once where the data enters a page, so standings, the bracket, the
 * match list and the team page all read from the same translated rows rather
 * than each translating at render time.
 */
export function toFinnishTeamNames<T extends { homeTeamName: string; awayTeamName: string }>(
  matches: T[]
): T[] {
  return matches.map((match) => ({
    ...match,
    homeTeamName: toFinnishCountryName(match.homeTeamName),
    awayTeamName: toFinnishCountryName(match.awayTeamName),
  }));
}

/**
 * The match list a region should render: translated for national teams, left
 * alone everywhere else.
 *
 * Club names are proper nouns — `Paris Saint-Germain FC` stays as it is — so
 * the region, not the competition, decides.
 */
export function localiseForRegion<T extends { homeTeamName: string; awayTeamName: string }>(
  matches: T[],
  region: CompetitionRegion
): T[] {
  return region === "national-teams" ? toFinnishTeamNames(matches) : matches;
}
