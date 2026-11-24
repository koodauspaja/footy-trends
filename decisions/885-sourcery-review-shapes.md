# 885 — Two more Sourcery review shapes `check:sourcery` knows: decisions

Chore #885. `npm run check:sourcery` stops on a review body in no known shape, even beside a full review (`decisions/597-check-sourcery.md`). Two shapes Sourcery writes now stopped it on pull requests whose heads it could otherwise judge. This adds them to the shapes `decisions/559-sourcery-review-kind.md` lists. It doesn't change that rule: any other body still stops it.

Counted from the first line of every Sourcery review on the last 60 pull requests, on 2026-11-24: 52 full reviews that found issues, 6 that found none, 6 quick checks, and the two shapes below.

| Decision | Why |
|---|---|
| **A review whose whole body is `New gaps against the [linked issues](https://github.com/…)` is left out**, as a reply in a thread already is | Sourcery posts its requirement table as a PR comment of its own, and this review only links to it, so it says nothing about the code. Seen on #833, #845 and #882. On #882 it stopped the check on `c97697f`, which had a full review four minutes later. Left out, the head's other reviews and its check-run decide |
| **Matched whole, link included**, and nothing more | The allowed shape is the one seen. A note with anything written after it is a shape not yet seen, and still stops the check with its first line quoted |
| **A refusal that starts `**Sorry` is a skip**, like the plain `Sorry` one | Sourcery's "too large to review" refusal is bold: `**Sorry @…, this pull request is too large to review**`. Seen on #824 and #864. On #824 it stopped the check instead of reporting a skip |
| **The budget notice's pattern is left as it is** | No bold budget notice has been seen. If one comes, it reads as a skip, which exits 1 the same, and only the reason reported would be wrong (the code review asked) |
| **The table in `skills/open-pr.md` step 7 says both** | It is how a reader tells what each first line means, so it lists what the check now reads. It also says to read the requirement table before handing off, since the check leaves it out |
