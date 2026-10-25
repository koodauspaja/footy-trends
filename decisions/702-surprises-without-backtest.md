# 702 — The season's surprises tell "no played match" from "no prediction yet": decisions

Bug #702. `Kauden suurimmat yllätykset` said `Kaudelta ei ole vielä pelattuja
otteluita.` for a season with played matches whenever no Elo backtest row was
stored for them. `getSeasonSurprises` reads finished matches joined to their
backtest rows, so an empty read meant either. Seen on VL 2026 in the e2e
stand-in database, which stores no TASO predictions. In production it happens
for a season none of whose finished matches has a backtest row yet, for example
one that started while the hourly run was halted.

| Decision | Why |
|---|---|
| A new status, `unpredicted`: the season has played matches, and none has Elo's backtest row. `empty` now means no played match | The two have different causes and different lines. This overrides specs/057's S12, which gave `Kaudelta ei ole vielä pelattuja otteluita.` to every season with no predicted match. The spec's S12, strings table and edge cases now say so. The other statuses (`ok`, `first-season`, `all-drawn`, `error`) are unchanged. It overrides decisions/057's "A season's states" (five, now six) and "`Kausi … (kesken)` without a list", whose `inProgress` the new status carries too |
| Its line: `Pelatuille otteluille ei ole vielä laskettu ennusteita.` | Agreed with Miikka on 2026-10-23, over `Yllätyksiä ei voi vielä näyttää: …` |
| "Played" comes from `getPlayedSeasons`, which replaces `getFirstStoredSeason` in `match-service.ts`. It returns every season with a stored finished match, and the first-season check takes its minimum. This overrides decisions/057's "The first stored season" row, which names `getFirstStoredSeason` | One read answers both questions, so the panel asks the database nothing new. It is the read the first-season check already made, TASO's competition-and-category pairing included |
| `getTeamUpset` uses the same read | It was `getFirstStoredSeason`'s other caller. Its answer is unchanged |
