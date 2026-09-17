import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  makeAsk,
  notRunByNpmMessage,
  npmCliFrom,
  type Prompt,
  packageManagerFrom,
  secret,
} from "../../../scripts/setup-wiring";

/** A prompt that answers as told, and records what it was asked and its closing. */
function prompt(answer: () => Promise<string>): Prompt & { asked: string[]; closes: string[] } {
  const asked: string[] = [];
  const closes: string[] = [];

  return {
    asked,
    closes,
    question: (query: string) => {
      asked.push(query);
      return answer();
    },
    close: () => {
      closes.push("closed");
    },
  };
}

describe("secret", () => {
  it("is 32 bytes of hex, which needs no escaping in a URL or an .env line", () => {
    expect(secret()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is a different one every time", () => {
    expect(secret()).not.toBe(secret());
  });
});

describe("makeAsk", () => {
  it("passes the question through and returns the answer", async () => {
    const p = prompt(async () => "typed");
    const ask = makeAsk(() => p);

    expect(await ask("Key: ")).toBe("typed");
    expect(p.asked).toEqual(["Key: "]);
  });

  it("reports no answer when input ends, rather than throwing", async () => {
    /**
     * Node's readline rejects a pending question on end of input —
     * `AbortError: Aborted with Ctrl+D`. Uncaught, that ended setup with a stack
     * trace where the prompt had just said "press Enter to skip".
     */
    const ask = makeAsk(() =>
      prompt(async () => {
        throw new Error("Aborted with Ctrl+D");
      })
    );

    await expect(ask("Key: ")).resolves.toBeNull();
  });

  it("closes the interface either way, so the process can exit", async () => {
    const answered = prompt(async () => "typed");
    const aborted = prompt(async () => {
      throw new Error("Aborted with Ctrl+D");
    });

    await makeAsk(() => answered)("Key: ");
    await makeAsk(() => aborted)("Key: ");

    expect(answered.closes).toEqual(["closed"]);
    expect(aborted.closes).toEqual(["closed"]);
  });

  it("makes a fresh interface per question, so none holds stdin while a child runs", async () => {
    let created = 0;
    const ask = makeAsk(() => {
      created += 1;
      return prompt(async () => "typed");
    });

    await ask("one: ");
    await ask("two: ");

    expect(created).toBe(2);
  });
});

describe("npmCliFrom", () => {
  it("takes npm's own path from the environment npm sets", () => {
    expect(npmCliFrom({ npm_execpath: "/usr/local/lib/node_modules/npm/bin/npm-cli.js" })).toBe(
      "/usr/local/lib/node_modules/npm/bin/npm-cli.js"
    );
  });

  it.each([{}, { npm_execpath: "" }, { npm_execpath: "   " }])(
    "reports nothing for %j, which means this was not started by npm",
    (env) => {
      expect(npmCliFrom(env)).toBeNull();
    }
  );

  it("says how to start it properly", () => {
    expect(notRunByNpmMessage()).toContain("npm run setup");
  });
});

describe("packageManagerFrom", () => {
  it("reads this repository's own pin", () => {
    const pinned = packageManagerFrom(readFileSync("package.json", "utf8"));

    expect(pinned).toMatch(/^npm@\d+\.\d+\.\d+$/);
  });

  it("reports nothing to compare against when the field is absent", () => {
    expect(packageManagerFrom('{"name":"x"}')).toBe("");
  });
});
