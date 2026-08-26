/**
 * Finnish names for the national teams football-data.org reports in English.
 *
 * Only the football-data side needs this. TASO already publishes Finnish names
 * — `Suomi`, `Valko-Venäjä`, `Alankomaat` — so the Huuhkajat and Helmarit
 * pages (#166, #167) will get them for free.
 *
 * Covers every country appearing in World Cup 2026 and Euro 2024, which is the
 * full set the app can currently reach. See specs/016-world-cup-and-euro.md.
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
