import type { CompetitionRegion } from "./competitions";

/**
 * Finnish names for the national teams football-data.org reports in English:
 * every country in World Cup 2026 and Euro 2024. TASO has its own map below.
 *
 * decisions/016-world-cup-and-euro.md
 * decisions/017-huuhkajat.md
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
 * Finnish names for the handful of national teams TASO reports in English, in
 * the spelling TASO itself uses elsewhere. Further English names go here.
 *
 * decisions/017-huuhkajat.md
 * decisions/018-helmarit.md
 */
const FINNISH_TASO_TEAM_NAMES: Record<string, string> = {
  "Bosnia and Herzegovina": "Bosnia-Hertsegovina",
  Croatia: "Kroatia",
  Cyprus: "Kypros",
  "Czech Republic": "Tšekki",
  Greece: "Kreikka",
  Italy: "Italia",
  Portugal: "Portugali",
  "Republic of Ireland": "Irlanti",
  Scotland: "Skotlanti",
};

/**
 * A TASO team name in Finnish, unchanged when it already is.
 *
 * decisions/017-huuhkajat.md
 */
export function toFinnishTasoTeamName(tasoName: string): string {
  return FINNISH_TASO_TEAM_NAMES[tasoName] ?? tasoName;
}

/**
 * Both sides of every match, with any English TASO name replaced.
 *
 * decisions/017-huuhkajat.md
 */
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
 * translation. Applied only to national-team competitions.
 *
 * decisions/016-world-cup-and-euro.md
 */
export function toFinnishCountryName(providerName: string): string {
  return FINNISH_COUNTRY_NAMES[providerName] ?? providerName;
}

/**
 * A match list with both team names in Finnish. Applied once, where the data
 * enters a page.
 *
 * decisions/016-world-cup-and-euro.md
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
 * decisions/016-world-cup-and-euro.md
 */
export function localiseForRegion<T extends { homeTeamName: string; awayTeamName: string }>(
  matches: T[],
  region: CompetitionRegion
): T[] {
  return region === "national-teams" ? toFinnishTeamNames(matches) : matches;
}
