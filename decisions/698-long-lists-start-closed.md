# 698 — A cup's earlier rounds start closed: decisions

Chore #698. A Suomen Cup's standings page opened every round's match list, so
MSC 2025 was 23 749 px tall at 375 px; it now starts at 1 999 px, measured on
2026-10-24. Agreed with Miikka on 2026-10-24 and
written on the issue: the latest round starts open and every earlier round
closed, each keeping its count. This overrides decisions/015's "Every round
starts **open**" under Collapsible rounds, and its `CupRoundSection` entry's
"every round starts open": the count each closed round keeps, `Juuson kierros
(123 ottelua)`, answers the worry that a hidden round reads as missing data.

| Decision | Why |
|---|---|
| The rounds that start open are the match lists starting on the Helsinki day the latest one does (`openCupGroups`) | A final and a third-place match can start on one day: NSC 2015 played `Pikkufinaali` and `Finaali` on 2.6. Reading by day, as `cupGroupOrder` does, opens both rather than whichever TASO listed first |
| Every group of a Suomen Cup is a match list, MSC 2021's six groups included | `buildGroup` makes a table only of a round-robin group in a cup that has them, Liigacup and Ykkösliigacup, and those never reach `CupRoundSection` |
| Huuhkajat's and Helmarit's years stay open, and spec 017 now gives its own reason | decisions/017 opened them "for the same reason" as the cups' rounds, which this record changes. Their 85 rows are about a quarter of a cup's height, as spec 017 already said |
| The team page's `Ottelut` stays open | Agreed on the issue: since #714 it is the team page's most basic part, the part #697's section toggles will keep open |
| Only Suomen Cups change: MSC and NSC are the knockout cups. Liigacup and Ykkösliigacup draw their own groups and playoff, with no `<details>` | `CupRoundSection` is the one place a cup's rounds fold |
| A round's count reads `1 ottelu` for one match, through `matchCountLabel` | The count is what a closed round says, and it read `(1 ottelua)` on every final. The team pages and the national team years already used the helper |
| The e2e checks that measure a cup page open every round first: the sideways scroll on a phone, the missing `Kierros` column, and `no-sideways-scroll.spec.ts` on every page | A closed round's list is not laid out, so a check run as the page starts would read the open round alone |

## On every stored cup season

Measured on the test database on 2026-10-24, the five Suomen Cup seasons it holds:

| Season | Rounds | Starts open | Starts closed |
|---|---|---|---|
| MSC 2021 | 8 | `Cup-vaihe` (12 matches, from 6.3.) | the six groups from 6.2., `Kakkosen-Cup` |
| MSC 2025 | 10 | `Loppuottelu` (1) | `Välierät` to `Juuson kierros` (123) |
| MSC 2026 | 10 | `Loppuottelu` (1) | `Välierät` to `Juuson kierros` (120) |
| NSC 2015 | 6 | `Loppuottelu` and `Pikkufinaali`, both on 2.6. | `Välierät` to `Kierros 1` |
| NSC 2026 | 9 | `Loppuottelu` (1) | `Välierät` to `Kierros 1` |
