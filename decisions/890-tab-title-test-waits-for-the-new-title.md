# 890 — The tab-title test waits for the new title: decisions

Bug #890. On the v2.1.0 release run (#887), "/ulkomaat/sarjataulukko updates the title when Kilpailu changes" in `tests/e2e/title-metadata.spec.ts` read an empty title right after the competition changed. It passed on its retry, and it had flaked on #881 too.

## Measured, 2026-11-25

A throwaway spec ran the Kilpailu change 40 times against a production build, Premier League to Championship. A `MutationObserver` logged every change of `document.title`, and a wrapper around `history.pushState` logged when the navigation began. Times are milliseconds after the selector changed.

| What | Result |
|---|---|
| The test's first check, `expectTitleToMatchHeading`, passed before `pushState` | 40 of 40: it passed at 146–247 ms, and the navigation began at 174–399 ms |
| The title went blank between the navigation and the new title | 38 of 40, for 1.2–4.6 ms each time |
| The test's single read of the title landed in the blank | 0 of 40 |

So the title is blank for a moment after the change, as `decisions/170-tab-title-follows-the-season.md` measured (7–17 ms on Next 16.3.2). The test could catch that moment because its checks did not wait for the navigation:

1. The title matched the heading on the page before the navigation, so the first check waited for nothing.
2. "The title is no longer the old one" accepted the blank title.
3. The single read that followed found the title still blank when it landed inside those few milliseconds.

The four Kausi tests waited for the URL first. The URL changes when the navigation begins, though, while the old title and heading still match. So they ended in the same single read and could fail the same way.

| Decision | Why |
|---|---|
| **The product is left as it is: the title may be blank for a few milliseconds** | Miikka: fix only the test. A gap of 1–5 ms cannot be seen, and it comes from how Next streams the page's metadata after the body. `decisions/170-tab-title-follows-the-season.md` stays as it was |
| **Each test waits until the title names the option chosen, then until the heading agrees** (`expectTitleToName`) | Each step retries, so neither the page before the navigation nor the blank between them can pass for the page after it. A title stuck one navigation behind never names the new option, so it still fails, which is what the spec protects |
| **All five tests use it, not only the Kilpailu one** | The Kausi tests had the same final single read. Fixing one would have left four waiting for their turn to flake |
| **A stand-in page holds the blank for 500 ms, and a test runs the check against it** | The real blank lasts a few milliseconds, too short to fail on demand. The stand-in keeps the old title for 200 ms and then a blank title for 500 ms. The checks the tests made before fail against it, and `expectTitleToName` passes |
