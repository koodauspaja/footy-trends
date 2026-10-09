import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Renovate's custom manager for the npm version the documents state: its
 * patterns still find the version README.md and INSTALL.md repeat from
 * `package.json`, and no other setup document states one they do not reach.
 *
 * decisions/461-renovate-updates-the-stated-npm-version.md
 * decisions/400-one-command-setup.md
 */

const ROOT = process.cwd();

// README.md, INSTALL.md and `docs/setup/` tell a reader which npm to install. A
// spec or decision record narrating an old version is history, not an
// instruction, and is deliberately outside this.
const SETUP_DOCUMENTS = ["README.md", "INSTALL.md"];
const SETUP_DIRECTORY = "docs/setup";

// Both ways a document states it: `npm 12.1.0`, and
// `npm install -g npm@12.1.0`.
const STATED = /npm[ @]\d+\.\d+\.\d+/;

type CustomManager = {
  customType: string;
  managerFilePatterns: string[];
  matchStrings: string[];
  depNameTemplate?: string;
  datasourceTemplate?: string;
};

function npmManagers(): CustomManager[] {
  const config = JSON.parse(readFileSync(path.join(ROOT, "renovate.json"), "utf8")) as {
    customManagers?: CustomManager[];
  };

  return (config.customManagers ?? []).filter((manager) => manager.depNameTemplate === "npm");
}

// The one manager under test. It throws, and does not return `undefined`, so a
// config that has lost the entry fails every assertion below by name.
function npmManager(): CustomManager {
  const [manager] = npmManagers();
  if (!manager) throw new Error("renovate.json has no customManagers entry for npm");

  return manager;
}

function pinnedVersion(): string | undefined {
  const { packageManager } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
    packageManager: string;
  };

  return /^npm@(.+)$/.exec(packageManager)?.[1];
}

// Renovate's `/regex/` form for a file pattern, which the test below pins so
// this conversion stays honest.
function asRegExp(pattern: string): RegExp {
  return new RegExp(pattern.slice(1, -1));
}

function filePatterns(): RegExp[] {
  return npmManager().managerFilePatterns.map(asRegExp);
}

function setupDocuments(): string[] {
  const inDirectory = readdirSync(path.join(ROOT, SETUP_DIRECTORY))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `${SETUP_DIRECTORY}/${name}`);

  return [...SETUP_DOCUMENTS, ...inDirectory];
}

function selects(patterns: RegExp[], file: string): boolean {
  return patterns.some((pattern) => pattern.test(file));
}

function contentsOf(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

describe("the Renovate custom manager for the stated npm version", () => {
  it("is one manager, reading npm from the npm datasource", () => {
    const managers = npmManagers();

    expect(managers).toHaveLength(1);
    expect(npmManager().customType).toBe("regex");
    expect(npmManager().datasourceTemplate).toBe("npm");
  });

  it("writes its file patterns as regular expressions", () => {
    // Renovate accepts a glob here too. These are regexes, and `asRegExp`
    // assumes it — so a glob slipping in has to fail rather than be read as
    // one and match nothing.
    for (const pattern of npmManager().managerFilePatterns) {
      expect(pattern, pattern).toMatch(/^\/.+\/$/);
    }
  });

  it("captures exactly the pinned version from every document it selects", () => {
    const patterns = filePatterns();
    const matchStrings = npmManager().matchStrings.map((source) => new RegExp(source, "g"));
    const selected = setupDocuments().filter((file) => selects(patterns, file));

    expect(selected).not.toEqual([]);

    for (const file of selected) {
      const contents = contentsOf(file);
      const captured: (string | undefined)[] = matchStrings.flatMap((matchString) =>
        [...contents.matchAll(matchString)].map((match) => match.groups?.currentValue)
      );

      // Renovate rewrites what `currentValue` captures, so anything else it
      // captures is a line left stale — or worse, rewritten wrongly.
      expect(captured, file).not.toEqual([]);
      expect(new Set(captured), file).toEqual(new Set([pinnedVersion()]));
    }
  });

  it("reaches every setup document that states an npm version", () => {
    const patterns = filePatterns();
    const stating = setupDocuments().filter((file) => STATED.test(contentsOf(file)));

    // A third document repeating the pin is how this drifts again: the manager
    // would keep two files honest, and CI would fail on the one it never saw.
    expect(stating).not.toEqual([]);
    for (const file of stating) {
      expect(
        selects(patterns, file),
        `${file} states an npm version no managerFilePatterns entry selects`
      ).toBe(true);
    }
  });
});
