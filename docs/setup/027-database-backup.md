# 027 — The production database's backup

## Goal

A daily, encrypted copy of production's database outside Railway, and a
restore that has been run. Why each part is as it is: `decisions/807-database-backup.md`.

---

## Step 1 — The bucket

In a Backblaze B2 account, region EU Central, create a **private** bucket
`footy-trends-db-backups` with **Object Lock on** (it cannot be turned on
later), then set:

- default retention: governance mode, 30 days;
- lifecycle rule: hide a file 30 days after upload, delete it 1 day after.

## Step 2 — Two keys, through the API

The console's "Write Only" key can delete locked files. With an account-wide
key, call `b2_create_key` on API **v4** twice, both limited to the bucket:

| Name | Capabilities | Goes to |
|---|---|---|
| `footy-trends-db-backup-upload` | `writeFiles` | the GitHub Environment, step 4 |
| `footy-trends-db-backup-read` | `listFiles`, `readFiles` | whoever restores; never GitHub |

Then delete the account-wide key.

## Step 3 — The database role

Against production, as `postgres`:

```sql
CREATE ROLE backup_reader LOGIN PASSWORD '<random>' IN ROLE pg_read_all_data;
```

Its address is production's public proxy address with `backup_reader` and that
password in it.

## Step 4 — The GitHub Environment

Repository → Settings → Environments → **New environment** `backup`.
Deployment branches: **Selected branches**, `main` only. No reviewers. Secrets:

| Secret | Value |
|---|---|
| `BACKUP_DATABASE_URL` | `backup_reader`'s address |
| `B2_KEY_ID`, `B2_APPLICATION_KEY` | the upload key |

## Step 5 — The recipients

Each person who may restore runs `age-keygen -o ~/.age/footy-backup.key`, keeps
the file in a password manager, and adds the printed public key to
`scripts/backup/recipients.txt`.

## Step 6 — Verify

1. Actions → **Database backup** → **Run workflow**, on `main`. It is green and
   its last lines name the two uploaded files.
2. Restore it:

   ```sh
   npm run backup:restore -- --b2-key=<read key file> --identity=~/.age/footy-backup.key
   ```

   The key file is two lines: the key's id, then the key. It ends with
   `Every table matches.`
