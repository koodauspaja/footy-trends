import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { runSetup, type SetupActions } from "../../../scripts/setup-steps";

const EXAMPLE = readFileSync(".env.example", "utf8");

/** A `.env` needing nothing, so a test can vary one thing about it. */
const COMPLETE = [
  "DATABASE_URL=postgresql://postgres:pw@localhost:5432/footy-trends",
  "FOOTY_POSTGRES_PASSWORD=pw",
  "BETTER_AUTH_SECRET=s",
  "BETTER_AUTH_URL=http://localhost:3000",
  "GOOGLE_CLIENT_ID=id",
  "GOOGLE_CLIENT_SECRET=sec",
  "FOOTBALL_DATA_API_KEY=fd",
  "TASO_API_KEY=taso",
  "",
].join("\n");

/**
 * Everything recorded, nothing real: `steps` is the order things happened in,
 * which is most of what this module is, and `written` is the last `.env` text.
 */
function actions(overrides: Partial<SetupActions> = {}) {
  const steps: string[] = [];
  const answers: string[] = [];
  const state = { env: COMPLETE as string | null, written: null as string | null };

  const base: SetupActions = {
    readEnv: () => state.env,
    readExample: () => EXAMPLE,
    writeEnv: (text) => {
      state.written = text;
      steps.push("writeEnv");
    },
    secret: () => "generated",
    interactive: false,
    ask: async (question) => {
      steps.push(`ask:${question}`);
      return answers.shift() ?? "";
    },
    userAgent: "npm/12.0.2 node/v24.16.0 darwin arm64 workspaces/false",
    exported: {},
    packageManager: "npm@12.0.2",
    runScript: async (name) => {
      steps.push(`run:${name}`);
      return 0;
    },
    out: (line) => steps.push(`out:${line}`),
    err: (line) => steps.push(`err:${line}`),
  };

  return { ...base, ...overrides, steps, answers, state };
}

/** The steps, as one string, for the assertions that are about wording. */
const said = (a: { steps: string[] }) => a.steps.join("\n");

describe("runSetup", () => {
  it("migrates and installs the browser, in that order, and writes nothing it need not", async () => {
    const a = actions();

    expect(await runSetup(a)).toBe(0);
    expect(a.steps.filter((step) => step.startsWith("run:"))).toEqual([
      "run:db:migrate",
      "run:test:e2e:browser",
    ]);
    expect(a.steps).not.toContain("writeEnv");
    expect(said(a)).toContain("nothing regenerated");
  });

  it("creates .env from the example when there is none", async () => {
    const a = actions({ readEnv: () => null });

    expect(await runSetup(a)).toBe(0);
    expect(a.steps).toContain("writeEnv");
    expect(said(a)).toContain("Created .env from .env.example");
    expect(parseEnv(a.state.written ?? "").FOOTY_POSTGRES_PASSWORD).toBe("generated");
  });

  it("stops on a password mismatch, before migrating or writing", async () => {
    const a = actions({
      readEnv: () =>
        "DATABASE_URL=postgresql://postgres:one@localhost:5432/footy-trends\nFOOTY_POSTGRES_PASSWORD=two\n",
    });

    expect(await runSetup(a)).toBe(1);
    expect(a.steps).not.toContain("writeEnv");
    expect(a.steps.some((step) => step.startsWith("run:"))).toBe(false);
    expect(said(a)).toContain("disagree");
  });

  it("stops when an exported variable would beat the .env it just wrote", async () => {
    /**
     * An export wins over `.env` for every command setup hands off to, so
     * migrations would go to one database while the file described another.
     * Raised in review on #409.
     */
    const a = actions({
      readEnv: () => null,
      exported: { DATABASE_URL: "postgresql://postgres:other@localhost:5432/somewhere-else" },
    });

    expect(await runSetup(a)).toBe(1);
    // The file is still written — it is correct, and the next run finds it
    // complete once the export is gone.
    expect(a.steps).toContain("writeEnv");
    expect(a.steps.some((step) => step.startsWith("run:"))).toBe(false);
    expect(said(a)).toContain("unset DATABASE_URL");
  });

  it("says nothing about an export that agrees with the file", async () => {
    const a = actions({
      exported: {
        DATABASE_URL: "postgresql://postgres:pw@localhost:5432/footy-trends",
        FOOTY_POSTGRES_PASSWORD: "pw",
      },
    });

    expect(await runSetup(a)).toBe(0);
    expect(a.steps).toContain("run:db:migrate");
  });

  it("warns about a different npm and carries on", async () => {
    const a = actions({ userAgent: "npm/11.0.0 node/v24.16.0 darwin arm64" });

    expect(await runSetup(a)).toBe(0);
    expect(said(a)).toContain("npm install -g npm@12.0.2");
    expect(a.steps).toContain("run:db:migrate");
  });

  it("stops with the migration's own exit code when it fails", async () => {
    const a = actions({
      runScript: async (name) => {
        a.steps.push(`run:${name}`);
        return name === "db:migrate" ? 2 : 0;
      },
    });

    expect(await runSetup(a)).toBe(2);
    expect(a.steps).not.toContain("run:test:e2e:browser");
    expect(said(a)).toContain("Migrations failed");
  });

  it("only warns when the Playwright browser will not install", async () => {
    const a = actions({
      runScript: async (name) => {
        a.steps.push(`run:${name}`);
        return name === "test:e2e:browser" ? 1 : 0;
      },
    });

    expect(await runSetup(a)).toBe(0);
    expect(said(a)).toContain("Only `npm run test:e2e` needs it");
    expect(said(a)).toContain("Setup is done");
  });

  it("names the keys and pages that are missing, without asking for them", async () => {
    const a = actions({
      readEnv: () =>
        "FOOTY_POSTGRES_PASSWORD=pw\nDATABASE_URL=postgresql://postgres:pw@localhost:5432/footy-trends\n",
    });

    expect(await runSetup(a)).toBe(0);
    expect(said(a)).toContain("FOOTBALL_DATA_API_KEY — foreign leagues");
    expect(said(a)).toContain("TASO_API_KEY — Finnish competitions");
    expect(said(a)).toContain("signing in will fail");
    // Nothing was asked: there is no terminal to answer.
    expect(a.steps.some((step) => step.startsWith("ask:"))).toBe(false);
  });

  it("prints how to start the app when nobody is there to ask", async () => {
    const a = actions();

    expect(await runSetup(a)).toBe(0);
    expect(said(a)).toContain("Start the app with `npm run dev`");
    expect(a.steps).not.toContain("run:dev");
  });
});

describe("runSetup, with a terminal", () => {
  /** Interactive, and answering the dev-server prompt with "n" unless told otherwise. */
  function interactive(answers: string[], overrides: Partial<SetupActions> = {}) {
    const a = actions({ interactive: true, ...overrides });
    a.answers.push(...answers);
    return a;
  }

  it("asks for each missing key, and writes each answer as it is given", async () => {
    const a = interactive(["footballkey", "tasokey", "n"], {
      readEnv: () =>
        `${COMPLETE.replace("FOOTBALL_DATA_API_KEY=fd", "FOOTBALL_DATA_API_KEY=").replace("TASO_API_KEY=taso", "TASO_API_KEY=")}`,
    });

    expect(await runSetup(a)).toBe(0);
    const values = parseEnv(a.state.written ?? "");
    expect(values.FOOTBALL_DATA_API_KEY).toBe("footballkey");
    expect(values.TASO_API_KEY).toBe("tasokey");
    // Written before the second was asked, so an interrupted run keeps the first.
    expect(a.steps.indexOf("writeEnv")).toBeLessThan(a.steps.indexOf("ask:TASO_API_KEY: "));
    expect(said(a)).not.toContain("show no data");
  });

  it("skips a key on Enter, and still says what that costs", async () => {
    const a = interactive(["", "", "n"], {
      readEnv: () =>
        "FOOTY_POSTGRES_PASSWORD=pw\nDATABASE_URL=postgresql://postgres:pw@localhost:5432/footy-trends\n",
    });

    expect(await runSetup(a)).toBe(0);
    expect(said(a)).toContain("FOOTBALL_DATA_API_KEY — foreign leagues");
    // The file was written — that fixture has no auth secret either — but an
    // answer of Enter put no key in it.
    expect(parseEnv(a.state.written ?? "").FOOTBALL_DATA_API_KEY).toBeUndefined();
    expect(parseEnv(a.state.written ?? "").TASO_API_KEY).toBeUndefined();
  });

  it("asks again after an answer that cannot be written", async () => {
    const a = interactive(["has space", "good-key", "", "n"], {
      readEnv: () => COMPLETE.replace("FOOTBALL_DATA_API_KEY=fd", "FOOTBALL_DATA_API_KEY="),
    });

    expect(await runSetup(a)).toBe(0);
    expect(said(a)).toContain("no spaces, quotes or #");
    expect(parseEnv(a.state.written ?? "").FOOTBALL_DATA_API_KEY).toBe("good-key");
  });

  it("starts the dev server when asked to, as the last thing it does", async () => {
    const a = interactive(["y"]);

    expect(await runSetup(a)).toBe(0);
    expect(a.steps.at(-1)).toBe("run:dev");
  });

  it("returns what the dev server returns", async () => {
    const a = interactive(["y"], {
      runScript: async (name) => {
        a.steps.push(`run:${name}`);
        return name === "dev" ? 130 : 0;
      },
    });

    expect(await runSetup(a)).toBe(130);
  });

  it("stops asking, and starts nothing, when input ends at a prompt", async () => {
    /**
     * Ctrl-D, or a piped run. Node's readline rejects the pending question, and
     * an uncaught rejection ended setup with a stack trace where the prompt had
     * just said "press Enter to skip" — found by running it.
     */
    const a = actions({
      interactive: true,
      // Both keys blank, so "the second was never asked" is visible: input has
      // ended, and it has ended for every question after this one too.
      readEnv: () =>
        COMPLETE.replace("FOOTBALL_DATA_API_KEY=fd", "FOOTBALL_DATA_API_KEY=").replace(
          "TASO_API_KEY=taso",
          "TASO_API_KEY="
        ),
      ask: async (question) => {
        a.steps.push(`ask:${question}`);
        return null;
      },
    });

    expect(await runSetup(a)).toBe(0);
    // One question per key at most, and the dev-server one — never a re-ask
    // into a stream that has ended.
    expect(a.steps.filter((step) => step.startsWith("ask:"))).toEqual([
      "ask:FOOTBALL_DATA_API_KEY: ",
      "ask:Start the dev server now? [Y/n] ",
    ]);
    expect(a.steps).not.toContain("run:dev");
    expect(a.state.written).toBeNull();
  });

  it("says how to start it later when the answer is no", async () => {
    const a = interactive(["no"]);

    expect(await runSetup(a)).toBe(0);
    expect(a.steps).not.toContain("run:dev");
    expect(said(a)).toContain("Start it later with `npm run dev`");
  });
});
