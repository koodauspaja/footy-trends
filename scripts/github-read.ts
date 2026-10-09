/**
 * What the checks that read GitHub share: one JSON answer over HTTPS, every
 * page of a list, and a verdict turned into output and an exit code.
 *
 * decisions/463-bare-issue-boxes-fail.md
 * decisions/559-sourcery-review-kind.md
 */

const API = "https://api.github.com";

/**
 * The most rows GitHub sends in one page.
 *
 * decisions/559-sourcery-review-kind.md
 */
export const PAGE = 100;

export type ReadJson = (path: string) => Promise<unknown>;

export type Console = {
  out: (line: string) => void;
  err: (line: string) => void;
};

export type Verdict = {
  passed: boolean;
  lines: string[];
};

/**
 * Fetches one JSON answer from the API. A status that is not a success is an
 * error, so something unreadable never reads as something empty.
 *
 * decisions/463-bare-issue-boxes-fail.md
 * decisions/559-sourcery-review-kind.md
 */
export function jsonReader(token: string): ReadJson {
  return async (path: string) => {
    const response = await fetch(`${API}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status} for ${path}`);
    }

    return response.json();
  };
}

/**
 * Every row of a list, page after page: a full page means there may be
 * another behind it. `rows` takes them out of one answer.
 *
 * decisions/559-sourcery-review-kind.md
 */
export async function readAll<Row>(
  read: ReadJson,
  path: string,
  rows: (answer: unknown) => Row[],
  page = 1
): Promise<Row[]> {
  const found = rows(await read(`${path}?per_page=${PAGE}&page=${page}`));
  return found.length < PAGE ? found : [...found, ...(await readAll(read, path, rows, page + 1))];
}

/**
 * Runs a check and turns its verdict into output and an exit code. A failed
 * read is not a pass: it exits 1 and says what could not be done.
 *
 * decisions/463-bare-issue-boxes-fail.md
 * decisions/559-sourcery-review-kind.md
 */
export async function conclude(
  console: Console,
  failure: string,
  check: () => Promise<Verdict>
): Promise<number> {
  try {
    const { passed, lines } = await check();
    for (const line of lines) (passed ? console.out : console.err)(line);
    return passed ? 0 : 1;
  } catch (error) {
    console.err(`${failure}: ${(error as Error).message}`);
    return 1;
  }
}

/**
 * The process's own streams, a line at a time.
 *
 * decisions/463-bare-issue-boxes-fail.md
 * decisions/559-sourcery-review-kind.md
 */
export function processConsole(): Console {
  return {
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`${line}\n`),
  };
}
