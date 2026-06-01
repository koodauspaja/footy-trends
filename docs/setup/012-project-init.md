# 012 — Project initialisation

## Goal
Scaffold the Next.js application with strict TypeScript and Biome for linting
and formatting. This replaces any placeholder files in `src/` with a real
project structure.

---

## Step 1 — Scaffold Next.js

Run this from the repo root. Answer the prompts as shown:

```bash
npx create-next-app@latest . --typescript
```

Prompts:
```
Would you like to use ESLint?                → No   (Biome replaces this)
Would you like to use Tailwind CSS?          → Yes
Would you like your code inside a `src/`     → Yes
  directory?
Would you like to use App Router?            → Yes
Would you like to use Turbopack for next     → Yes
  dev?
Would you like to customize the import       → Yes
  alias (@/* is already set)?               → keep default (@/*)
```

This creates the standard Next.js App Router structure inside `src/`.

---

## Step 2 — Pin Node version

Create `.nvmrc` in the repo root:

```
24
```

Add an `engines` field to `package.json` so Railway and CI both fail loudly if
the wrong Node version is used rather than silently misbehaving:

```json
"engines": {
  "node": ">=24"
}
```

---

## Step 3 — Replace tsconfig.json

`create-next-app` generates a basic `tsconfig.json`. Replace it entirely with
a stricter version:

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
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
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

## Step 4 — Install and configure Biome

Biome replaces ESLint and Prettier with a single fast tool.

```bash
npm install --save-dev @biomejs/biome
npx biome init
```

Replace the generated `biome.json` with:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
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
        "noExplicitAny": "error",
        "noConsoleLog": "error"
      },
      "style": {
        "noNonNullAssertion": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "files": {
    "ignore": [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "coverage/**"
    ]
  }
}
```

Notable rules:
- `noExplicitAny` — enforces the "no `any`" rule from `REVIEW_RULES.md` at the tooling level
- `noConsoleLog` — catches leftover debug logs before they reach review
- `noNonNullAssertion` — warns on `!` assertions; prefer explicit narrowing

---

## Step 5 — Remove ESLint

`create-next-app` installs ESLint even when you say no, or leaves remnants.
Clean it up:

```bash
npm uninstall eslint eslint-config-next
rm -f .eslintrc.json .eslintrc.js .eslintignore
```

Remove the `eslint` script from `package.json` if present, and delete the
`next/core-web-vitals` lint config from `next.config.ts` if it appears there.

---

## Step 6 — Add scripts to package.json

Add these to the `scripts` section:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "test": "jest --coverage",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write .",
  "typecheck": "tsc --noEmit"
}
```

---

## Step 7 — Install Jest for TypeScript

```bash
npm install --save-dev jest @types/jest ts-jest jest-environment-jsdom \
  @testing-library/react @testing-library/jest-dom
```

Create `jest.config.ts`:

```typescript
import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default createJestConfig(config);
```

Create `jest.setup.ts`:

```typescript
import "@testing-library/jest-dom";
```

---

## Step 8 — Verify everything works

```bash
npm run typecheck   # should pass with no errors
npm run lint        # should pass on the scaffolded code
npm run build       # should produce a clean Next.js build
```

Fix any issues before committing — the CI workflow in `013-ci-workflow.md`
will run all three.

---

## Step 9 — Commit

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
- [ ] No ESLint config or packages remaining

## Next
→ `013-ci-workflow.md`