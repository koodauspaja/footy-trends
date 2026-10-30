# 743 — Biome keeps the scope it had: decisions

Chore #743. Renovate's upgrade to Biome 2.6.4 (#712) failed `npm run lint` with
`biome.json` unchanged and valid for 2.6.4 (`biome migrate` reports no migration
needed). Two behaviours changed with the version, and this record keeps Biome
doing what it did before.

| Decision | Why |
|---|---|
| `files.includes` leaves out `**/*.md` and `.sourcery.yaml` | Biome 2.6 formats Markdown and YAML, and `**` matched them: about 240 files reported as unformatted, among them every decision record. Decision records are added, never edited, so reformatting them is not an option, and Markdown was never formatted by Biome here before |
| The `playwright` linter domain is set to `none` | Biome switches a domain on by itself when its dependency is present, and `@playwright/test` is one. Its rules then fire on vitest tests (`describe` callbacks, missing awaits), which are not Playwright tests, giving 6 errors. The e2e specs lose none of the checks `biome.json` asked for |
| Biome formatting Markdown was considered and left out | It would rewrite every record. If it is wanted later, it is its own chore, with a decision on the old records |
| The six new warnings stay | `useMathMinMax` in `src/lib/group-order.ts` and `useDomNodeTextContent` in three e2e specs are warnings, which do not fail lint. Fixing them is code changes outside this chore |

Verified on Biome 2.6.4: `npm run lint` finds 0 errors and 6 warnings.
