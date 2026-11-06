# 777 — Arvauspeli takes the app to 2.0.0: decisions

Chore #777. The release after v1.20.0 brings Arvauspeli (072–079) to
production. `scripts/next-version.ts` would name it v1.21.0, because nothing in
the range is marked breaking. It is named v2.0.0 instead, chosen in chat on
2026-11-06: Arvauspeli is a new part of the app, not one more feature of the
old one.

| Decision | Why |
|---|---|
| The major moves for a product reason, not because something breaks | No commit in the range is marked breaking, and Arvauspeli is added beside what was there. The number says the app is now a different thing to its users, and that is a person's call, as `FIRST_RELEASE_VERSION` is for a first release (`decisions/085-release-workflow.md`) |
| The version is still computed. This record's commit carries `docs!:`, and the existing rule turns it into a major | `decisions/085-release-workflow.md` stands: the same commits give the same number to whoever releases them. The choice is a commit in the history that anyone can read back, not a setting in someone's hands at release time |
| No version override in the tooling | A one-off does not need a second way to decide the number. A later major chosen the same way takes the same route: a record, in a commit marked `!` |
| The `!` is on this commit, not on #752's or a feature's | The release notes list the breaking commit's subject. On a Tailwind patch, or on one of the eight features, the row would name the wrong change as the reason for 2.0.0 |
| The notes show this row under "Breaking changes" | That heading comes from `scripts/next-version.ts` and is the same on every release. Changing it for one release is the tooling change this record avoids, and the row's own sentence says what moved the number |

Checked on the branch, against `origin/release`: `npm run release:version`
reported `Bump major` and `Next v2.0.0`, and `--print=notes` listed #777 alone
under Breaking changes, with the eight features under Features.
