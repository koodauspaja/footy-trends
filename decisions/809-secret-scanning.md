# 809 — Secret scanning and push protection: decisions

Chore #809. The repository is public, and every secret-scanning setting was
`disabled`. Renovate and `npm audit` do not look for keys, so a committed key
would have reached a public history with nothing to stop it or find it.

| Decision | Why |
|---|---|
| Secret scanning and push protection are on | Both are free on a public repository. Push protection rejects a push that carries a recognised key, so the key never reaches GitHub. Scanning finds one that is already in the history |
| Non-provider patterns and validity checks stay off | The organisation is on the Free plan. A `PATCH` that enables them answers 200 and leaves both `disabled`, alone or together with the other two, and the scan-history endpoint answers "Advanced Security is disabled on this repository" (measured 2026-11-20). GitHub Secret Protection can be bought only on Team or Enterprise. The docs never say outright that these two settings need it, so this rests on that measurement. They come back if the plan changes |
| They were turned on through the API, not the settings page | One `PATCH` of `security_and_analysis` can be repeated and read back with the same command. The setup step uses the settings page, as the other steps of `docs/setup/001` do |
| Push protection was tested with a fake GitHub token, not a test format | GitHub documents no test secret for push protection, and its "GitHub Test Token" pattern is not one push protection blocks. A fake `ghp_` token is 30 random characters plus the format's CRC32 checksum, and is not a credential. Pushed to a scratch branch, it was rejected with `GH013`, "Push cannot contain secrets", and the branch does not exist on GitHub |
| The first scan of the history needed no dismissals | It found no alerts, open or resolved. A later alert is a real key until shown otherwise: rotate it first, then dismiss it with a reason |
| Dependabot alerts and CodeQL stay out | Renovate handles updates, and CodeQL is a separate decision |
