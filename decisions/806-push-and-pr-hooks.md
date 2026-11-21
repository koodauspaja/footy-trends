# 806 — Push and pull request rules enforced by hooks: decisions

Chore #806. Four rules about pushing and opening a pull request were kept as
notes, and each had been broken at least once. Now each one refuses:

- **A branch behind `origin/main`:** the git pre-push hook refuses to push it.
- **`gh pr create` on an unpushed head:** a Claude Code `PreToolUse` hook on Bash refuses it.
- **`gh pr create` closing an issue with a bare box:** the same hook refuses it.
- **`git add -A`, `git add --all` and `git add .`:** the same hook refuses them.

The project's workflow is Claude Code, so a hook declared in the tracked
`.claude/settings.json` binds every session working on it.

## The pre-push check

| Decision | Why |
|---|---|
| **What is compared:** each pushed branch's commit, read from the refs git gives the hook, is checked with `git merge-base --is-ancestor origin/main <commit>`, after `git fetch origin +refs/heads/main:refs/remotes/origin/main` | The rule is about the branch being pushed, and the pushed commit is that branch. The issue says `HEAD`, which is the same commit in every push this project makes. The comparison differs only for `git push origin other-branch`, and there the pushed commit is the right one. With no stdin, as when the check is run by hand, the current branch's `HEAD` is used. The refspec is explicit so `origin/main` is updated whatever the clone's fetch configuration |
| **Not checked:** `main`, `release`, tags and deletions | `main` is what the others are checked against, and `release` is promoted from it (as the issue says). A tag or a deletion is not a branch being pushed |
| **Failures:** a failed fetch skips the check with a message; a failed `merge-base` blocks; pushed refs not in git's shape mean the current branch's `HEAD` is checked | The issue asks for the skip when the fetch fails, the way the e2e check is skipped without dependencies. Once `origin/main` is fetched, git failing to compare is not a pass. Refs the check cannot read lead to the stricter path, as the e2e check runs in full when it cannot read what a push changes (decisions/661) |
| **Order:** it runs before the e2e freshness check, and both read the refs the hook captures once | git writes the refs to stdin once. The cheap check goes first, so a stale branch is not sent to a six-minute e2e run |

## The Claude Code hook

| Decision | Why |
|---|---|
| **What starts it:** `scripts/hooks/claude-bash-guard.sh` hands the hook input to `claude-bash-guard.ts` only when the text contains `gh` then `pr`, or `git` then `add`, with anything between them | The hook runs on every Bash call. tsx takes about half a second to start, and the filter keeps that off every other command. A missing `node_modules` skips the guard with a message, as the git hooks do |
| **How a command is read:** it is split as Bash would split it (`scripts/hooks/shell-command.ts`). That covers quotes and escapes; `$(…)`; heredocs, `<<\EOF` included; redirections, whose written targets are kept (`>`, `>>`, `&>`; not `<` or `<<<`); and comments. `cd` and `pushd` are followed into an absolute or relative directory, past `--` and options such as `-P`, a subshell's `cd` ends with the subshell, and `popd` loses track. A command is recognised past shell keywords (`then`, `do`, `!`, `{` …), `env` and its options, `command`, `exec`, `time` and `nohup`, and `gh`'s `-R`/`--repo` wherever it stands, and by its name without its directory, so `/usr/bin/git` is `git` | The hook sees one string. Without this, a heredoc that writes `git add -A` into a file, or a `--title "a && b"`, would be read as commands. Following `cd` matters because this project's sessions run `cd <worktree> && gh pr create` |
| **`gh pr create` after an unfollowable `cd`:** refused. `cd` with no target, `-`, `~` or a variable cannot be followed | Without the directory, the hook cannot tell which branch it would open |
| **"Pushed":** the local `@{upstream}` equals `HEAD`, or for `--head <branch>`, that branch's upstream equals its local commit. No upstream is a refusal | A failed push leaves the upstream where it was, so the comparison catches #647's case without a network call. `git push && gh pr create` in one command is refused too: the hook runs before the push, as the issue notes |
| **Where the body is read from:** the last `--body`/`-b`, as written, or the last `--body-file`/`-F`, read from disk. gh takes the last of a repeated option | A body built by the shell (`$(…)`, backticks, a variable such as `$BODY`, `$1` or `$@`), read from stdin, left to gh (`--fill`, `--web`, `--editor`, `--template`), or in a file a redirection earlier in the same line may write (its target, or one built by the shell such as `"$F"`) cannot be read before the command runs. A body file under `~/` is read from the home directory. That is a refusal saying to use `--body-file`, because an unread body is not a body with no closing keyword. Every pull request this project's sessions opened used `--body-file` |
| **The boxes:** `closedIssues` and `bareBoxes` from `scripts/checks/issue-boxes-plan.ts`, and its report text; issues are read with `bodyReader` | The rule is the one CI's `Issue checkboxes` job applies, so the two cannot disagree. The issue names `scripts/issue-boxes-plan.ts`, which #816 moved under `scripts/checks/` |
| **Issue reads:** a closed issue that cannot be read is a refusal. The token is `GH_TOKEN`, `GITHUB_TOKEN`, then `gh auth token` | The same "a failed read is not a pass" as `check:boxes` (decisions/463) |
| **`git add` of everything:** `-A` alone or in a cluster such as `-vA`, `--all`, or `.`, `./`, `*`, `./*`, `:/` or `:/.` as a path, on any branch. Git's own options before `add` (`-C <dir>`, `-c k=v`) are skipped | These are the forms that stage the whole checkout from its top, where this project's sessions stand. `git add ..` from a subdirectory is not read as the whole checkout: the hook does not know where the top is. After `--`, a word is a path, so `git add -- -A` stages a file named `-A` |
| **Unreadable input:** the command runs, with a message | A hook that refused whenever its input changed shape would stop every Bash call. Claude Code's input is the one thing here not under this repository's control |
| **The answer:** exit code 2 with the reasons on stderr | That is what Claude Code reads as "block this call, and tell Claude why". Every reason the command earns is given at once, so one refusal does not hide the next |

## Not done

- **What runs only inside another shell or a substitution** (`bash -c '…'`, `$(git add -A)`), **a filter deliberately avoided by quoting** (`g'i't`), and **`owner/repo#N` closing references** are not seen. The hook is there for mistakes, not for evasion: `--no-verify` and the hook itself stay the way past it. The closing references are read as CI's `Issue checkboxes` job reads them, so the two cannot disagree.
- **Control flow and other writers:** a `cd` inside an `if` branch or a pipeline is followed as if it ran, and a body file written by a command (`tee`, `cp`) rather than a redirection is read as it was. Each needs a line built round the hook rather than a mistake in an ordinary one.
- **Races between the check and the command it guards** are not closed: another push to `main`, a commit to the branch, an edit of an issue or of the remote branch in the seconds between. That needs another process on the same branch at the same moment. The `main` ruleset's "require branches to be up to date" and CI's `Issue checkboxes` job recheck the two that matter on GitHub.

- **Checks that need judgement,** CI enforcement, and blocking `--no-verify`: out of scope in the issue.
- **e2e at pull-request time:** #837 adds it to this hook, and moves the pre-push e2e check to a branch's first push (#817's decision).
