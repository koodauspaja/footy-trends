# 012 — Project initialisation

## Goal
Scaffold the Next.js application with strict TypeScript and Biome for linting
and formatting. This replaces any placeholder files in `src/` with a real
project structure.

---

## Step 1 — Scaffold Next.js

Because the repo already has files in it, scaffold into a temp directory and
copy the generated files across:

```bash
cd ..
npx create-next-app@latest footy-trends-temp --typescript --tailwind --src-dir --app --turbopack --import-alias "@/*" --biome
```

Then copy the generated files into the repo:

```bash
cp footy-trends-temp/AGENTS.md footy-trends/
cp footy-trends-temp/biome.json footy-trends/
cp footy-trends-temp/CLAUDE.md footy-trends/
cp footy-trends-temp/next-env.d.ts footy-trends/
cp footy-trends-temp/next.config.ts footy-trends/
cp footy-trends-temp/package-lock.json footy-trends/
cp footy-trends-temp/package.json footy-trends/
cp footy-trends-temp/postcss.config.mjs footy-trends/
cp footy-trends-temp/tsconfig.json footy-trends/
cp -R footy-trends-temp/node_modules footy-trends/
cp -R footy-trends-temp/public footy-trends/
cp -R footy-trends-temp/src footy-trends/
rm -rf ../footy-trends-temp
cd footy-trends
```

> `CLAUDE.md` is where Claude Code reads project-specific instructions.
> `AGENTS.md` serves the same purpose for other AI coding agents. Keep both.

---

## Step 2 — Pin Node version

Create `.nvmrc` in the repo root:

```
24
```

Add an `engines` field to `package.json` so Railway and CI both fail loudly if
the wrong Node version is used:

```json
"engines": {
  "node": ">=24"
}
```

Create `.npmrc` in the repo root to pin all future package installs to exact
versions instead of `^` ranges:

```
save-exact=true
```

This won't retroactively fix versions already in `package.json` from the
scaffold, but any new installs going forward will be pinned. Renovate handles
keeping those exact versions up to date via automated PRs.

---

## Step 3 — Replace tsconfig.json

Replace the generated `tsconfig.json` with a stricter version:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

Key options above baseline `strict: true`:

| Option | Effect |
|--------|--------|
| `noUncheckedIndexedAccess` | Array and object index access returns `T \| undefined` — forces you to handle missing values |
| `exactOptionalPropertyTypes` | `{ foo?: string }` disallows explicitly passing `undefined` — must omit the key |
| `noImplicitReturns` | Every code path in a function must return a value |
| `noUnusedLocals` / `noUnusedParameters` | Compile error on dead code |
| `allowJs: false` | No JavaScript files — everything must be TypeScript |

---

## Step 4 — Replace biome.json

Replace the generated `biome.json` with the project version that adds the
required linting rules on top of the generated defaults:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.2.0/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!node_modules", "!.next", "!dist", "!build", "!coverage"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "error",
        "useExhaustiveDependencies": "error"
      },
      "suspicious": {
        "noUnknownAtRules": "off",
        "noExplicitAny": "error",
        "noConsole": "error"
      },
      "style": {
        "noNonNullAssertion": "warn"
      }
    },
    "domains": {
      "next": "recommended",
      "react": "recommended"
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

Notable rules:
- `noExplicitAny` — enforces the "no `any`" rule from `REVIEW_RULES.md` at the tooling level
- `noConsole` — catches all console calls (`log`, `error`, `warn` etc.) before they reach review
- `noNonNullAssertion` — warns on `!` assertions; prefer explicit narrowing

---

## Step 5 — Add scripts to package.json

Update the `scripts` section:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "test": "vitest run --coverage",
  "test:watch": "vitest",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write .",
  "typecheck": "tsc --noEmit"
}
```

---

## Step 6 — Install Vitest

```bash
npm install --save-dev vitest @vitejs/plugin-react \
  @vitest/coverage-v8 jsdom \
  @testing-library/react @testing-library/jest-dom
```

Create `vitest.config.ts`:

```typescript
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text"],
      exclude: ["node_modules", ".next", "vitest.config.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create `vitest.setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

---

## Step 7 — Verify everything works

```bash
npm run typecheck   # should pass with no errors
npm run lint        # should pass on the scaffolded code
npm run build       # should produce a clean Next.js build
```

Fix any issues before committing — the CI workflow in `013-ci-workflow.md`
will run all three.

---

## Step 8 — Commit

```bash
git add .
git commit -m "chore: initialise Next.js project with strict TypeScript and Biome"
git push origin main
```

---

## Done when
- [ ] `next dev` runs without errors
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Vitest installed and `npm test` runs

## Next
→ `013-ci-workflow.md`