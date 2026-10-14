# 012 — The application, locally

## Goal

The application running on your machine. It arrives with the clone; nothing is
scaffolded.

---

## Step 1 — Run the setup script

```bash
./scripts/setup
```

`INSTALL.md` has the prerequisites (Node 24, the pinned npm, Docker), what the
script does, the same steps by hand, and troubleshooting.

Two API keys are needed for real data; the app starts without them.
`007-football-data-api.md` and `020-taso-api-key.md` get them later in this
sequence.

## Step 2 — Run the gate

```bash
npm run verify
```

Lint, typecheck, unit tests, the shuffled unit run, integration and end-to-end,
in order. The end-to-end stage needs both API keys in `.env`.

---

## Where the configuration lives

| | File |
|---|---|
| Node and npm versions | `.nvmrc`, `package.json` (`engines`, `packageManager`) |
| TypeScript | `tsconfig.json` |
| Lint and format, with the rules this project adds | `biome.json` |
| Tests | `vitest.config.ts`, `playwright.config.ts` |
| Scripts | `package.json` |

## Done when

- [ ] The app answers at `http://localhost:3000`
- [ ] `npm run verify` passes, once both API keys are in `.env`

## Next

→ `015-database-setup.md`
