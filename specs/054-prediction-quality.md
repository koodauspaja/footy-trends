# 054 — Prediction quality: how often the models are right, and how well calibrated

> **Status: Q1–Q12 answered in chat on 2026-10-01; the Finnish strings and
> three edge-case rules (Q13–Q15) proposed, awaiting confirmation.** Written for #350 (rolling
> accuracy) and #351 (Brier score, log-loss and calibration), joined: both
> judge the same logged predictions (specs/052) against the same results.
> #352 (model against model) and #353 (per competition) are named in Q2 and
> Q10.

## Summary

Two models now predict every upcoming match — the home-win baseline
(specs/051) and Elo (specs/053) — and the log holds years of backtested
predictions besides. This answers the question the log exists for: **are the
predictions any good?** How often the most likely outcome happened, how far
the probabilities were from what happened (Brier score, log-loss), and
whether "70 %" really comes true seven times in ten (calibration).

## Scope

### In scope

- A page, `/ennusteet`, judging the models' logged predictions against the
  stored results (S1), one provider at a time (S4).
- Accuracy over time (#350), Brier score and log-loss (#351), and a
  calibration chart (#351).
- Both models side by side (S2) — #352 is closed into this spec.

### Out of scope

- Any new model, or a change to one.
- Per-competition figures — #353, unless Q10 brings it in.
- Any change to what is logged.

## Settled decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| S1 | Where it lives | **A new page, `/ennusteet`, `Ennusteiden osuvuus`**, linked from `Ennuste` and the navigation | Miikka, 2026-10-01 (Q1). |
| S2 | Both models | **Side by side on every figure; #352 is closed into this spec** | Miikka, 2026-10-01 (Q2). With two models every figure is already the comparison #352 asks for. |
| S3 | Live or backtest | **Backtest by default, a switch `Ennakkoon tehdyt` / `Jälkikäteen lasketut`; never mixed** | Miikka, 2026-10-01 (Q3). specs/052 S2. |
| S4 | Which matches | **A `Kotimaa` / `Ulkomaat` switch, so no figure pools providers: domestic from the 2016 season, European from 2023; only matches both models predicted** | Miikka, 2026-10-01 (Q4): "go with b". Domestic keeps eight more seasons; 2016 leaves out Elo's cold 2015 run-in (specs/053 S7). |
| S5 | Accuracy | **The outcome given the highest probability happened; a tie goes home, then draw** | Miikka, 2026-10-01 (Q5). |
| S6 | Over time | **Rolling over the last 200 predictions, a line per model** | Miikka, 2026-10-01 (Q6). |
| S7 | Brier and log-loss | **One figure each per model for the window, and per season in a small table**; log-loss with natural log, a 0 probability clamped to 0,001 | Miikka, 2026-10-01 (Q7). |
| S8 | Calibration | **10-point bins, a line per model, the diagonal as perfect; a bin under 50 probabilities left off, and said** | Miikka, 2026-10-01 (Q8). |
| S9 | Explaining | **One Finnish sentence under each measure, the baseline as the yardstick** | Miikka, 2026-10-01 (Q9). |
| S10 | Per competition | **Out of scope; #353 adds a filter later** | Miikka, 2026-10-01 (Q10). |
| S11 | Computing | **Per request, cached in Redis 15 minutes; measured before review** | Miikka, 2026-10-01 (Q11). |
| S12 | Access | **Signed in only** | Miikka, 2026-10-01 (Q12). |

## UX / UI (Finnish strings)

**Proposed, pending Q13.**

**Home page:** a fourth tile after the three regions — `Ennusteet`,
`Ennusteiden osuvuus`. **Match page:** under `Ennuste`'s rounding line, a link
`Kuinka hyvin ennusteet ovat osuneet?` to `/ennusteet`.

**`/ennusteet`**, heading `Ennusteiden osuvuus`:

- Under it: `Kuinka usein perustaso ja Elo ovat ennustaneet ottelun lopputuloksen oikein, ja kuinka hyvin niiden todennäköisyydet ovat pitäneet paikkansa.`
- Two switches (links, as the site's other selectors): `Kotimaa` · `Ulkomaat`
  (S4), and `Jälkikäteen lasketut` · `Ennakkoon tehdyt` (S3); the default is
  `Kotimaa`, `Jälkikäteen lasketut`.
- The window line, from the data: `{n} ottelua kausilta 2016–2026, joille molemmat mallit ovat antaneet ennusteen.` (`2023/24–2025/26` for spanning seasons, as specs/049 S18).
- Under the backtest: `Jälkikäteen lasketut ennusteet on laskettu kustakin ottelusta vain sitä ennen pelattujen otteluiden perusteella.`

**`Osumatarkkuus`** (#350, S5, S6):
- Per model, the window's total: `Perustaso 46 %` · `Elo 50 %`.
- A chart, a line per model (`Perustaso` dashed, `Elo` solid, as a legend
  says), the share right over the last 200 matches, x the date of the latest,
  y `Osuma-% (200 viimeisintä)`.
- `Ennuste on oikein, kun todennäköisimmäksi arvioitu lopputulos toteutui.`

**`Brier-pistemäärä ja log-loss`** (#351, S7, S9):
- A table: `Malli` · `Brier` · `Log-loss`, one row per model, three decimals
  with a comma (`0,601`).
- A second table per season: `Kausi` · `Ottelut` · `Perustaso` · `Elo`, the
  Brier score.
- `Brier-pistemäärä mittaa, kuinka kaukana ennustetut todennäköisyydet olivat toteutuneesta: 0 on täydellinen ja 2 huonoin.`
- `Log-loss rankaisee erityisesti varmoista virheistä.`
- `Kummassakin pienempi on parempi: Elo on parempi kuin perustaso, jos sen luku on pienempi.`

**`Kalibrointi`** (#351, S8):
- A chart: x `Ennustettu todennäköisyys (%)`, y `Toteutunut osuus (%)`, the
  diagonal dashed and labelled `Täydellinen kalibrointi`, a line per model.
- `Hyvin kalibroitu malli osuu lävistäjälle: sen 70 prosentin ennusteista noin 70 % toteutuu.`
- When a bin is left off: `Väleistä, joissa on alle 50 ennustetta, ei piirretä pistettä.`

| String | When |
|---|---|
| `Ennusteiden osuvuutta ei voitu laskea. Yritä myöhemmin uudelleen.` | The read failed |
| `Ennusteita, joiden ottelu on jo pelattu, ei ole vielä.` | No judged match in the window (Q14) |
| `Liukuvaan osumatarkkuuteen tarvitaan vähintään 200 ottelua; nyt niitä on {n}.` | Fewer than 200 judged matches (Q14) |
| `Kirjaudu sisään nähdäksesi ennusteiden osuvuuden.` | Signed out (S12) |

## API & Data

**No new table, no provider request.**

| Needed | Where |
|---|---|
| Judged predictions | `predictions` rows of one kind and one provider (S3, S4), `home-baseline-v1` and `elo-v1`, joined by provider match id to `matches` or `taso_matches` |
| The result | Finished, both scores; on football-data the shoot-out subtracted (specs/049 S3) |
| The window | TASO season ≥ 2016, football-data season ≥ 2023 (S4); only matches with a row from both models (S4) |
| Accuracy | The highest probability's outcome, ties home then draw (S5); rolling over 200 by kickoff (S6) |
| Brier | `Σ (pᵢ − oᵢ)²` over the three outcomes, 0–2, averaged (S7) |
| Log-loss | `−ln p` of the outcome that happened, p clamped to at least 0,001, averaged (S7) |
| Calibration | Every probability (three per match) in bins `[0,10)` … `[90,100]`, the share of each bin whose outcome happened; bins under 50 omitted (S8) |
| Cache | Per provider and kind, Redis, 15 minutes (S11) |
| Access | `canSeeAnalytics()` before anything is read (S12) |

## Edge Cases

| Case | Behaviour |
|---|---|
| A prediction whose match was cancelled or never got a result | Not judged |
| A match only one model predicted (a placeholder side has no Elo row) | Not judged by either (S4) |
| A score corrected after the fact (#492) | Judged against the stored score as it is now |
| A shoot-out | A draw (specs/049 S3) |
| A probability of 0 for what happened | Log-loss uses 0,001 (S7) |
| Two outcomes sharing the highest probability | Home, then draw, counts as the pick (S5) |
| No judged match yet (live predictions, early on) | The empty line instead of the figures (Q14) |
| Fewer than 200 judged matches | The totals, Brier and calibration shown; the rolling chart replaced by the count line (Q14) |
| A calibration bin under 50 probabilities | Not drawn, and the line under the chart says so (S8) |
| A season with judged matches | A row in the per-season table, its count shown (Q15) |
| The read fails | The failure line; the rest of the site unaffected |
| Signed out | The sign-in line; no figure in the HTML (S12) |

## Performance & Limits

About 56 000 backtest rows today (28 000 matches under two models), growing
by a few thousand a season; per provider and kind, one join and an in-memory
pass. Measured on production-sized data before review (S11).

## Security & Secrets

No new environment variable or secret.

## Acceptance Criteria

- [ ] Signed in, `/ennusteet` shows `Ennusteiden osuvuus` with the `Kotimaa` / `Ulkomaat` and `Jälkikäteen lasketut` / `Ennakkoon tehdyt` switches, `Kotimaa` and the backtest by default
- [ ] Only matches both models predicted are judged, from the 2016 season domestically and 2023 for football-data, and the window line says how many
- [ ] Accuracy counts a prediction right when its highest-probability outcome happened (ties home, then draw); the rolling chart covers the last 200 by kickoff, a line per model
- [ ] Brier and log-loss match their definitions, per model for the window and the Brier per season
- [ ] Calibration bins every probability by tens, omits a bin under 50 and says so, and draws the diagonal
- [ ] A shoot-out is a draw; a match without a result is not judged
- [ ] Fewer than 200 judged matches, or none, show their Finnish lines
- [ ] The home page has an `Ennusteet` tile; `Ennuste` links to the page
- [ ] A failed read shows the failure line; signed out, no figure is in the HTML
- [ ] No provider request; cached per provider and kind for 15 minutes, its cost measured and written down
- [ ] Correct in light and dark, and legible at 375 px
- [ ] Every user-facing string added is Finnish

## Tests Required

| File | Minimal assertions |
|---|---|
| `tests/unit/lib/prediction-quality.test.ts` | Accuracy and its tie rule; rolling 200; Brier and log-loss by hand, the 0,001 clamp; calibration bins, their edges, the under-50 rule; the both-models filter |
| `tests/unit/lib/…service….test.ts` | The window per provider; kind kept apart; the cache key; failure as its own case |
| `tests/unit/components/…` | Both switches and their defaults; the three sections; every Finnish line; signed out |
| `tests/unit/app/…` | The page's parameters; the home tile; the link from `Ennuste` |
| `tests/integration/…` | The join against Postgres: a shoot-out a draw; a match without a result left out; one model's match left out |
| `tests/e2e/…` | Signed in, the page with seeded predictions; signed out, the prompt |

Every new test is mutation-checked before review, per `skills/self-review.md`.

## Files To Update

- `specs/054-prediction-quality.md` (this file)
- `src/lib/prediction-quality.ts` (pure), its service, the page under
  `src/app/predictions/`, the home page's tile, and the link from `Ennuste`
- `decisions/054-prediction-quality.md`, by the implementing agent

## Open Questions

Q1–Q12 were answered in chat on 2026-10-01 and are recorded as S1–S12.
Writing the rest raised three, proposed here:

13. **The Finnish strings** in UX / UI, the home page's `Ennusteet` tile and
    the link from `Ennuste`. *Proposal: as drafted.*
14. **Too few matches.** No judged match: one line instead of every figure.
    Fewer than 200: the totals, Brier and calibration still shown, the
    rolling chart replaced by a line giving the count. *Proposal: as stated —
    live predictions will be in this state for weeks.*
15. **The per-season table** lists every season with a judged match, with its
    count, however few. *Proposal: as stated; the count shows what a row
    rests on, as specs/049 S10.*
