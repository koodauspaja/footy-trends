# 325 — TASO's Finland linked to Huuhkajat or Helmarit: decisions

Chore #325 had no record of its own; #531 created this one for reasons cut from
the comments of its code.

## Moved from comments, 2026-10-05

Cut from `src/lib/favourites.ts` at `55a14fc` by #531.

- **`MENS_FRIENDLIES_CATEGORY`, `WOMENS_FRIENDLIES_CATEGORY`.** Both national
  sides carry an A-friendlies category in every bucket, with the same id either
  side of TASO's `Muut` rename, as `national-team.ts` records. The tournament
  ids cannot say which side: a `W` prefix looks like the women's game until
  `WCQ`, the men's World Cup qualifiers. The competition names would say it by
  their ` Huuhkajat` and ` Helmarit` suffixes, but they come from a live TASO
  call, and this runs on every session read.
- **`nationalTeamPathFor`.** Only Finland has a page; its opponents appear in
  TASO's data with none anywhere. An id carrying both categories cannot be sent
  to one of them, and team search (#247) already renders an unlinked row.
- **`FavouriteTeamView.href`.** `/suosikit` and team search derived
  `/${region}/joukkue/${id}` independently, so Finland's pages, which are
  `/maajoukkueet/huuhkajat` and `/maajoukkueet/helmarit` rather than id routes,
  would have needed the same exception twice.
- **`idRouteFor`.** Carried `nationalTeamPathFor`'s doc comment; each now has
  its own.
