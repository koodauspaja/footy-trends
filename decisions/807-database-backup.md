# 807 — The production database's backup, outside Railway: decisions

Chore #807. Nothing backed up the production database, or restored it.
Production holds what no provider can give back: accounts, avatars, Arvauspeli
guesses and groups, nicknames, preferences and the prediction log. Each choice
below was agreed in chat on 2026-11-21, one at a time, and is on the issue.

| Decision | Why |
|---|---|
| A scheduled GitHub workflow runs the backup, not a Railway cron | Production's Postgres already has a public address, Railway's TCP proxy, which read-only measurements use. A cron inside Railway would only have been worth it to close that address, and it would have needed its own way to report a failure. A failed workflow run is red, and GitHub emails it |
| The secrets are in a GitHub Environment `backup` that only `main` can use, with no reviewers | A repository secret can be read by a workflow on any branch of the repository, Renovate's included. A reviewer would stop the schedule waiting for someone |
| Production is read as `backup_reader`, a member of `pg_read_all_data` | It reads every table and writes nothing, so the secret is not the app's password and cannot change data |
| The file goes to Backblaze B2, not workflow artifacts, R2 or a personal drive | The repository is public, so any signed-in GitHub user can download its artifacts. B2 can issue a key that only uploads (below); R2 has no such key and locks deletion with a bucket rule instead. Both are free at this size: 10 GB, and a backup is about 6 MB |
| The account is `Koodauspaja`'s, the bucket private, in `eu-central-003` (Amsterdam) | Not a person's account, and the copy stays in the EU |
| The workflow's key has `writeFiles` only, on that bucket only, made through the API | The console's "Write Only" choice includes `deleteFiles` and `bypassGovernance`, which together delete locked files. This one cannot list, read or delete; tested on 2026-11-21 by an upload that worked and a delete and a list that were refused |
| Object Lock, governance mode, 30 days, on every upload; a lifecycle rule hides a file after 30 days and deletes it a day later | Without the lock, the upload key could hide every file and the lifecycle rule would delete them the next day. Governance, not compliance, so the account-wide key can still delete a backup early, as erasing a person's data might need |
| Each file is kept 30 days | A month of history; at about 6 MB a day it stays far inside the free 10 GB |
| Encrypted with `age` on the runner, to Miikka's and Kalle's public keys in `scripts/backup/recipients.txt` | Neither GitHub nor Backblaze ever holds a key that decrypts. Two recipients, so either can restore alone, and nobody shares a private key |
| Row counts are taken in the dump's snapshot: `pg_export_snapshot()` in a repeatable-read transaction, the counts, then `pg_dump --snapshot` | Counts taken before or after the dump drift with the hourly writes. In one snapshot, the restore check compares exact numbers |
| `pg_dump` and `pg_restore` run from the `postgres:18-alpine` image | The server's major. The runner's client is older, and a client older than the server refuses it |
| Connections require encryption (`PGSSLMODE=require`, `ssl: "require"`), without verifying the certificate | The server is reached over the internet. Railway's `postgres-ssl` signs its own certificate, so verification would always fail |
| The restore goes into `footy-trends_restore_check` on the local Docker Postgres, found by the image and port 5432 | A fixed name, so no argument can point its drop at another database. Found by port, not by Compose project, because a worktree's Compose project serves that port as often as this checkout's |
| A run that never starts goes unnoticed | GitHub turns off a scheduled workflow after 60 days without repository activity, and nothing then fails. This repository is active daily; agreed on the issue as out of scope |
| `/tietosuoja` names Backblaze, and says a deleted account leaves the backups within about a month | Deletion reaches the live database at once and a backup only when its lifecycle removes it. A file can last 31 days, so the page says about a month rather than a number it would miss by one |
| Redis, staging and point-in-time recovery are not backed up | Redis holds caches and rate-limit counters; staging's data can be made again; recovery to a moment was ruled out of scope |

## First run, 2026-11-21

From a developer machine, with the workflow's own secrets, before the workflow
existed on `main`: backup `20261121T142846Z`, 23 tables, 195 204 rows, a 6 MB
encrypted dump, in 10 seconds. Restored with the read key and an `age`
identity, every table's count equalled the count taken at backup time.
