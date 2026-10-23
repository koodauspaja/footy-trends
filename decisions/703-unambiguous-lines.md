# 703 — A match page's title, its meetings line and an average position read unambiguously: decisions

Chore #703, three lines the #695 sweep found working against each other. Each
string was agreed with Miikka on 2026-10-23, and is written on the issue.

| Decision | Why |
|---|---|
| A match page's `h1` is its scoreboard: `IF Gnistan 2–1 AC Oulu`, each name a link to its team page where it has one, and `IF Gnistan – AC Oulu` before the match. The line that repeated it under the heading is gone. The tab title stays `IF Gnistan – AC Oulu` | The page named its teams twice, once as a heading and once as a scoreboard. `PageShell` takes a heading that is not plain text for it, and the other pages pass strings as before |
| In the heading the winner keeps the heading's weight and the loser drops to normal. A draw and a match to come leave both names as they are | The scoreboard showed the winner in bold against a normal-weight loser. Inside a semibold heading that needs the loser set to normal, not the winner set to bold |
| `Aiemmat kohtaamiset`'s empty line: `Ei kohtaamisia ennen tätä ottelua.` The link `Kaikki kohtaamiset (4)` is unchanged | `Aiempia kohtaamisia ei löytynyt.` directly above `Kaikki kohtaamiset (4)` read as a contradiction, since the four include later meetings. The line now says it means before this match |
| An average position has no ordinal period: `1,7`. A place keeps it: `9.`. The text alternative reads `Sijoitus: tämä kausi 9., tavallisesti 1,7.` | `1,7.` read as an ordinal after a decimal. This overrides decisions/038's `5,8.` for the baseline. The sentence's own full stop now always follows the baseline, because the baseline never ends in one |
