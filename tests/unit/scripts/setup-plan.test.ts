import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { isComposeDatabase } from "../../../scripts/services-plan";
import {
  API_KEYS,
  composeDatabaseUrl,
  composePasswordOf,
  DATABASE_VARIABLES,
  exportedOverrideMessage,
  LEGACY_DATABASE_URL,
  LOCAL_AUTH_URL,
  missingApiKeys,
  missingGoogleMessage,
  missingKeysMessage,
  npmVersionFromUserAgent,
  npmVersionWarning,
  planEnv,
  readKeyInput,
  setEnvValue,
  wantsDevServer,
} from "../../../scripts/setup-plan";

const EXAMPLE = readFileSync(".env.example", "utf8");

/** Deterministic secrets, numbered so a test can tell which call produced which. */
function secrets() {
  let n = 0;
  return () => {
    n += 1;
    return `generated${n}`;
  };
}

describe(".env.example", () => {
  /**
   * #400's acceptance criterion, as a mechanism: the file is tracked, so a value
   * in any of these is a credential in git history. `planEnv` generates them
   * precisely so that nobody is tempted to ship one.
   */
  it.each([
    "DATABASE_URL",
    "FOOTY_POSTGRES_PASSWORD",
    "BETTER_AUTH_SECRET",
    "GOOGLE_CLIENT_SECRET",
    ...API_KEYS.map((key) => key.name),
  ])("leaves %s blank", (name) => {
    const values = parseEnv(EXAMPLE);

    expect(name in values).toBe(true);
    expect(values[name]).toBe("");
  });
});

describe("composeDatabaseUrl", () => {
  it("names the compose database, which the reset guard also recognises", () => {
    const url = composeDatabaseUrl("pw");

    expect(url).toBe("postgresql://postgres:pw@localhost:5432/footy-trends");
    expect(isComposeDatabase(url)).toBe(true);
  });

  it("round-trips a password with characters a URL reserves", () => {
    // `%` is the one the URL setter leaves alone; without the explicit encoding
    // the result does not decode at all.
    const password = "a b/c@d%e:f";

    expect(composePasswordOf(composeDatabaseUrl(password))).toBe(password);
  });
});

describe("composePasswordOf", () => {
  it("reads the password from a compose URL", () => {
    expect(composePasswordOf("postgresql://postgres:secret@localhost:5432/footy-trends")).toBe(
      "secret"
    );
  });

  it.each([
    ["another port", "postgresql://postgres:secret@localhost:6543/footy-trends"],
    ["another host", "postgresql://postgres:secret@db.example.com:5432/footy-trends"],
    ["another user", "postgresql://user:password@localhost:5432/footy-trends"],
  ])("says nothing about %s", (_, url) => {
    expect(composePasswordOf(url)).toBeNull();
  });

  it("treats a malformed escape as no password rather than throwing", () => {
    expect(
      composePasswordOf("postgresql://postgres:%E0%A4%A@localhost:5432/footy-trends")
    ).toBeNull();
  });
});

describe("setEnvValue", () => {
  it("replaces an assignment and leaves every other line as it was", () => {
    const text = "# comment\nA=1\nB=\n# another\n";

    expect(setEnvValue(text, "B", "two")).toBe("# comment\nA=1\nB=two\n# another\n");
  });

  it("replaces every assignment, because the last one is the one read", () => {
    const result = setEnvValue("A=1\nA=2\n", "A", "3");

    expect(result).toBe("A=3\nA=3\n");
    expect(parseEnv(result).A).toBe("3");
  });

  it("does not match a variable whose name merely ends with this one", () => {
    expect(setEnvValue("NOT_A=1\n", "A", "2")).toBe("NOT_A=1\nA=2\n");
  });

  it("appends when absent, adding the newline a file without one lacks", () => {
    expect(setEnvValue("A=1", "B", "2")).toBe("A=1\nB=2\n");
    expect(setEnvValue("", "B", "2")).toBe("B=2\n");
  });

  it("keeps a Windows line ending on the line it replaces", () => {
    expect(setEnvValue("A=1\r\nB=2\r\n", "A", "3")).toBe("A=3\r\nB=2\r\n");
  });

  it("writes a value containing `=` whole", () => {
    expect(parseEnv(setEnvValue("A=old\n", "A", "x=y")).A).toBe("x=y");
  });

  it.each(["a#b", "has space", 'quo"te', "$HOME", "new\nline"])(
    "refuses %j, which would read back as something else",
    (value) => {
      expect(() => setEnvValue("", "A", value)).toThrow("Cannot write A unquoted");
    }
  );

  it("refuses a name that is not one", () => {
    expect(() => setEnvValue("", "A.*", "x")).toThrow("Not an environment variable name");
  });

  it("writes what the parser reads back, for a compose URL", () => {
    const url = composeDatabaseUrl("a b/c@d%e");

    expect(parseEnv(setEnvValue("", "DATABASE_URL", url)).DATABASE_URL).toBe(url);
  });
});

describe("planEnv", () => {
  it("fills a fresh .env from the example, with one password in both halves", () => {
    const plan = planEnv({ existing: null, example: EXAMPLE, secret: secrets() });
    const values = parseEnv(plan.text);

    expect(values.FOOTY_POSTGRES_PASSWORD).toBe("generated1");
    expect(composePasswordOf(values.DATABASE_URL ?? "")).toBe("generated1");
    expect(isComposeDatabase(values.DATABASE_URL ?? "")).toBe(true);
    expect(values.BETTER_AUTH_SECRET).toBe("generated2");
    expect(plan.stop).toBeNull();
  });

  it("keeps the example's comments", () => {
    const plan = planEnv({ existing: null, example: EXAMPLE, secret: secrets() });

    expect(plan.text).toContain("# The local Postgres container's password");
  });

  it("reports names and how each was arrived at, never a value", () => {
    const plan = planEnv({ existing: null, example: EXAMPLE, secret: secrets() });

    expect(plan.written).toEqual([
      "FOOTY_POSTGRES_PASSWORD (generated)",
      "DATABASE_URL (the compose database, with that password)",
      "BETTER_AUTH_SECRET (generated)",
    ]);
    expect(plan.written.join("\n")).not.toMatch(/generated\d/);
  });

  it("changes nothing on a second run", () => {
    /**
     * The acceptance criterion that matters most: the password is what the
     * Postgres volume was initialised with, and regenerating it would lock the
     * developer out of their own database.
     */
    const first = planEnv({ existing: null, example: EXAMPLE, secret: secrets() });
    const second = planEnv({
      existing: first.text,
      example: EXAMPLE,
      secret: () => {
        throw new Error("a second run must not generate anything");
      },
    });

    expect(second.text).toBe(first.text);
    expect(second.written).toEqual([]);
  });

  it("builds on an existing .env, not on the example", () => {
    const plan = planEnv({ existing: "MY_OWN=1\n", example: EXAMPLE, secret: secrets() });

    expect(plan.text.startsWith("MY_OWN=1\n")).toBe(true);
    expect(plan.text).not.toContain("# Football data API");
  });

  it("treats the URL the example used to ship as unset", () => {
    const existing = `DATABASE_URL=${LEGACY_DATABASE_URL}\nFOOTY_POSTGRES_PASSWORD=\n`;
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });

    expect(parseEnv(plan.text).DATABASE_URL).toBe(composeDatabaseUrl("generated1"));
  });

  it("adopts the password a pre-#292 .env kept only in DATABASE_URL", () => {
    const existing =
      "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/footy-trends\nFOOTY_POSTGRES_PASSWORD=\n";
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });
    const values = parseEnv(plan.text);

    expect(values.FOOTY_POSTGRES_PASSWORD).toBe("postgres");
    expect(values.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/footy-trends");
    expect(plan.written[0]).toBe("FOOTY_POSTGRES_PASSWORD (taken from DATABASE_URL)");
  });

  it("refuses to adopt a password it cannot write, and changes nothing", () => {
    /**
     * `…:ab%23cd@…` decodes to `ab#cd`, and `#` starts a comment in an unquoted
     * `.env` value. Writing it threw, so setup died on an existing `.env` it was
     * meant to repair — raised in review on #409. The password is the one the
     * volume was created with, so a substitute would fail to connect.
     */
    const existing =
      "DATABASE_URL=postgresql://postgres:ab%23cd@localhost:5432/footy-trends\nFOOTY_POSTGRES_PASSWORD=\n";
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });

    expect(plan.stop).toContain("cannot be written into .env");
    expect(plan.stop).toContain("FOOTY_POSTGRES_PASSWORD='p#ss word'");
    expect(plan.text).toBe(existing);
    expect(plan.written).toEqual([]);
  });

  it("adopts a password whose URL encoding is only cosmetic", () => {
    // `%2D` is a hyphen: decoded it is perfectly writable, so this is adopted
    // rather than refused.
    const existing =
      "DATABASE_URL=postgresql://postgres:ab%2Dcd@localhost:5432/footy-trends\nFOOTY_POSTGRES_PASSWORD=\n";
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });

    expect(plan.stop).toBeNull();
    expect(parseEnv(plan.text).FOOTY_POSTGRES_PASSWORD).toBe("ab-cd");
  });

  it("generates rather than adopting an empty password from DATABASE_URL", () => {
    const existing = "DATABASE_URL=postgresql://postgres@localhost:5432/footy-trends\n";
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });

    expect(parseEnv(plan.text).FOOTY_POSTGRES_PASSWORD).toBe("generated1");
    // And the URL, which was set by hand, is not rewritten — so the two now
    // disagree, and saying so is the only honest outcome.
    expect(plan.stop).not.toBeNull();
  });

  it("reports two halves that disagree, and decides nothing", () => {
    const existing =
      "DATABASE_URL=postgresql://postgres:one@localhost:5432/footy-trends\nFOOTY_POSTGRES_PASSWORD=two\n";
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });

    expect(plan.stop).toContain("disagree");
    expect(parseEnv(plan.text).FOOTY_POSTGRES_PASSWORD).toBe("two");
  });

  it("leaves a DATABASE_URL for some other server alone, whatever its password", () => {
    const remote = "postgresql://app:elsewhere@db.example.com:5432/app";
    const plan = planEnv({
      existing: `DATABASE_URL=${remote}\nFOOTY_POSTGRES_PASSWORD=local\n`,
      example: EXAMPLE,
      secret: secrets(),
    });

    expect(parseEnv(plan.text).DATABASE_URL).toBe(remote);
    expect(plan.stop).toBeNull();
  });

  it("fills a blank auth URL with the dev server's address", () => {
    const plan = planEnv({ existing: "BETTER_AUTH_URL=\n", example: EXAMPLE, secret: secrets() });

    expect(parseEnv(plan.text).BETTER_AUTH_URL).toBe(LOCAL_AUTH_URL);
    expect(plan.written).toContain(`BETTER_AUTH_URL (${LOCAL_AUTH_URL})`);
  });

  it("keeps an auth URL and secret that are already set", () => {
    const existing =
      "BETTER_AUTH_URL=https://staging.example.com\nBETTER_AUTH_SECRET=mine\nFOOTY_POSTGRES_PASSWORD=p\n" +
      `DATABASE_URL=${composeDatabaseUrl("p")}\n`;
    const plan = planEnv({ existing, example: EXAMPLE, secret: secrets() });

    expect(plan.text).toBe(existing);
  });
});

describe("missingApiKeys", () => {
  it("lists both for the example, and neither once both are set", () => {
    expect(missingApiKeys(EXAMPLE).map((key) => key.name)).toEqual([
      "FOOTBALL_DATA_API_KEY",
      "TASO_API_KEY",
    ]);
    expect(missingApiKeys("FOOTBALL_DATA_API_KEY=a\nTASO_API_KEY=b\n")).toEqual([]);
  });

  it("counts whitespace as blank", () => {
    expect(missingApiKeys("FOOTBALL_DATA_API_KEY=a\nTASO_API_KEY=   \n")).toHaveLength(1);
  });
});

describe("readKeyInput", () => {
  it("skips on an empty answer", () => {
    expect(readKeyInput("   ")).toEqual({ kind: "skip" });
  });

  it("accepts a key, trimmed of the whitespace a paste brings with it", () => {
    expect(readKeyInput("  abc123DEF-_.~+/=  ")).toEqual({
      kind: "key",
      value: "abc123DEF-_.~+/=",
    });
  });

  it.each(["abc#def", "abc def", '"abc"', "abc$x"])("refuses %j", (input) => {
    expect(readKeyInput(input)).toEqual({ kind: "invalid" });
  });

  it("only accepts what setEnvValue can write", () => {
    const answer = readKeyInput("abc~+/=._-");

    expect(answer.kind).toBe("key");
    if (answer.kind === "key") {
      expect(() => setEnvValue("", "TASO_API_KEY", answer.value)).not.toThrow();
    }
  });
});

describe("messages", () => {
  it("names each missing key's pages, and that e2e refuses", () => {
    const message = missingKeysMessage(API_KEYS);

    expect(message).toContain("FOOTBALL_DATA_API_KEY — foreign leagues (/ulkomaat)");
    expect(message).toContain("TASO_API_KEY — Finnish competitions (/kotimaa)");
    expect(message).toContain("`npm run test:e2e` does not");
  });

  it("names whichever Google values are blank", () => {
    expect(missingGoogleMessage("GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n")).toContain(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set"
    );
    expect(missingGoogleMessage("GOOGLE_CLIENT_ID=x\nGOOGLE_CLIENT_SECRET=\n")).toContain(
      "GOOGLE_CLIENT_SECRET not set"
    );
    expect(missingGoogleMessage("GOOGLE_CLIENT_ID=x\nGOOGLE_CLIENT_SECRET=y\n")).toBeNull();
  });
});

describe("exportedOverrideMessage", () => {
  const ENV =
    "DATABASE_URL=postgresql://postgres:pw@localhost:5432/footy-trends\nFOOTY_POSTGRES_PASSWORD=pw\n";

  it("says nothing when nothing is exported", () => {
    expect(exportedOverrideMessage({}, ENV)).toBeNull();
  });

  it("says nothing when the export agrees with the file", () => {
    const exported = {
      DATABASE_URL: "postgresql://postgres:pw@localhost:5432/footy-trends",
      FOOTY_POSTGRES_PASSWORD: "pw",
    };

    expect(exportedOverrideMessage(exported, ENV)).toBeNull();
  });

  it("names the one that disagrees, and how to be rid of it", () => {
    const message = exportedOverrideMessage({ DATABASE_URL: "postgresql://elsewhere/db" }, ENV);

    expect(message).toContain("DATABASE_URL is exported in this shell");
    expect(message).toContain("unset DATABASE_URL");
  });

  it("names both when both disagree, reading as a plural", () => {
    const message = exportedOverrideMessage(
      { DATABASE_URL: "postgresql://elsewhere/db", FOOTY_POSTGRES_PASSWORD: "other" },
      ENV
    );

    expect(message).toContain("DATABASE_URL and FOOTY_POSTGRES_PASSWORD are exported");
    expect(message).toContain("unset DATABASE_URL FOOTY_POSTGRES_PASSWORD");
  });

  it("counts an exported empty value, which the child still inherits", () => {
    /**
     * Measured on Node 24: with `DATABASE_URL=` exported, `loadEnvFile` leaves
     * it `""`, because a variable that is already set is not overwritten. The
     * child would migrate with no connection string while `.env` held a good
     * one. This test asserted the opposite until review on #409.
     */
    const message = exportedOverrideMessage({ DATABASE_URL: "" }, ENV);

    expect(message).toContain("DATABASE_URL is exported in this shell");
    expect(message).toContain("counts even when it is empty");
  });

  it("counts whitespace as its own value, since that is what the child gets", () => {
    expect(exportedOverrideMessage({ FOOTY_POSTGRES_PASSWORD: " pw " }, ENV)).not.toBeNull();
  });

  it("covers exactly the two variables that decide which database is used", () => {
    expect(DATABASE_VARIABLES).toEqual(["DATABASE_URL", "FOOTY_POSTGRES_PASSWORD"]);
  });
});

describe("npm version", () => {
  const AGENT = "npm/12.0.1 node/v24.16.0 darwin arm64 workspaces/false";

  it("reads the version from npm's user agent", () => {
    expect(npmVersionFromUserAgent(AGENT)).toBe("12.0.1");
    expect(npmVersionFromUserAgent("npm/12.0.2")).toBe("12.0.2");
  });

  it.each(["", "yarn/1.22.0 npm/? node/v24", "npm/12.0.1x node/v24"])(
    "reads nothing from %j",
    (agent) => {
      expect(npmVersionFromUserAgent(agent)).toBeNull();
    }
  );

  it("warns when the running npm is not the pinned one, with the command to fix it", () => {
    const warning = npmVersionWarning(AGENT, "npm@12.0.2");

    expect(warning).toContain("pins npm 12.0.2; this is 12.0.1");
    expect(warning).toContain("npm install -g npm@12.0.2");
  });

  it("says so when it cannot tell which npm this is", () => {
    expect(npmVersionWarning("", "npm@12.0.2")).toContain("this is an unknown npm");
  });

  it("is quiet when they match, or when nothing parseable is pinned", () => {
    expect(npmVersionWarning(AGENT, "npm@12.0.1")).toBeNull();
    expect(npmVersionWarning(AGENT, "")).toBeNull();
    expect(npmVersionWarning(AGENT, "pnpm@9.0.0")).toBeNull();
  });

  it("matches the version every document states", () => {
    /**
     * #400 found README.md saying 12.0.1 while package.json pinned 12.0.2. The
     * pin is the source; any `npm 12.x.y` a document states must agree with it.
     */
    const pinned = /^npm@(.+)$/.exec(
      (JSON.parse(readFileSync("package.json", "utf8")) as { packageManager: string })
        .packageManager
    )?.[1];

    for (const file of ["README.md", "INSTALL.md"]) {
      // `npm 12.0.2` and `npm@12.0.2` alike — both are ways of stating it, and
      // both have to agree with the pin.
      const stated = [...readFileSync(file, "utf8").matchAll(/npm[ @](\d+\.\d+\.\d+)/g)].map(
        (match) => match[1]
      );
      expect(stated, file).not.toEqual([]);
      expect(new Set(stated), file).toEqual(new Set([pinned]));
    }
  });
});

describe("wantsDevServer", () => {
  it.each(["", "y", "Y", " yes "])("starts on %j", (answer) => {
    expect(wantsDevServer(answer)).toBe(true);
  });

  it.each(["n", "no", "later"])("does not on %j", (answer) => {
    expect(wantsDevServer(answer)).toBe(false);
  });

  it("does not on end of input, which is not agreement", () => {
    expect(wantsDevServer(null)).toBe(false);
  });
});
