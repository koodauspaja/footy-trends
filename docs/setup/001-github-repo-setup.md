# 001 — GitHub repository

## Goal

Your own copy of the repository on GitHub, with Actions limited to the people
who work on it and pushes checked for keys.

This project: organisation `koodauspaja`, repository `footy-trends`, public.

---

## Step 1 — Create the repository

Create an empty repository in your organisation, turn on its secret checks,
and only then push a clone of this one to it, so the first push is checked
too:

```bash
git clone https://github.com/koodauspaja/footy-trends.git
cd footy-trends
git remote rename origin source
gh repo create <your-org>/<your-repo> --public --source . --remote origin
```

Repository → **Settings**, section **Secret Protection**: enable **Secret
scanning**, then **Push protection**. Both are free on a public repository. On
the Free plan, **Generic patterns** and **Validity checks** cannot be turned
on.

```bash
git push -u origin main
```

Everything the later steps refer to arrives with the clone: the application,
`.github/` (workflows, issue and pull request templates), `skills/`, `specs/`,
`decisions/` and these documents.

## Step 2 — Give your collaborator access

1. Organisation → **People** → **Invite member**
2. Repository → **Settings** → **Collaborators and teams** → add them with
   **Write** access

## Step 3 — Name who may run the workflows

`ci.yml` and `sonarcloud.yml` run only for the actors named in two repository
variables, and for `renovate[bot]`.

Repository → **Settings** → **Secrets and variables** → **Actions** →
**Variables**:

| Name | Value |
|---|---|
| `OWNER_USERNAME` | your GitHub username |
| `COLLABORATOR_USERNAME` | your collaborator's |

## Step 4 — Require approval for workflows from forks

The repository is public, so anyone can open a pull request from a fork.

Repository → **Settings** → **Actions** → **General** → **Fork pull request
workflows from outside collaborators** → **Require approval for all outside
collaborators**.

---

## Done when

- [ ] The repository exists in your organisation, with this one's contents
- [ ] Your collaborator has Write access
- [ ] `OWNER_USERNAME` and `COLLABORATOR_USERNAME` are set as repository variables
- [ ] Fork pull request workflows need approval
- [ ] `gh api repos/:owner/:repo --jq .security_and_analysis` shows
      `secret_scanning` and `secret_scanning_push_protection` `enabled`

## Next

→ `002-github-project-board.md`
