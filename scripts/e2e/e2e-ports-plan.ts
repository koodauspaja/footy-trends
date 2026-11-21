/**
 * Whether e2e's ports are free before it starts, and when they are not, who
 * holds each and what to do. Pure: `e2e-ports-steps.ts` asks `lsof` and git.
 *
 * decisions/849-e2e-names-port-holders.md
 */

/**
 * A process listening on one of e2e's ports, and the git checkout its working
 * directory is in, or `null` outside one.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export type PortHolder = { port: number; pid: number; command: string; checkout: string | null };

/**
 * The ports a run will listen on: the app's always, the TASO stand-in's and its
 * Redis only when the stand-in is on, as `playwright.config.ts` reads them.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export function portsInUse(ports: { app: number; taso: number; redis: number }, standIn: boolean) {
  return standIn ? [ports.app, ports.taso, ports.redis] : [ports.app];
}

/**
 * The processes in `lsof -F pc` output: each `p<pid>` line, with the
 * `c<command>` line after it.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export function listeners(output: string): { pid: number; command: string }[] {
  const found: { pid: number; command: string }[] = [];
  let pid: number | null = null;
  for (const line of output.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (line.startsWith("c") && pid !== null) found.push({ pid, command: line.slice(1) });
  }
  return found;
}

/**
 * The directory in `lsof -d cwd -F n` output, or `null` when it names none.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export function workingDirectory(output: string): string | null {
  const line = output.split("\n").find((text) => text.startsWith("n"));
  return line === undefined ? null : line.slice(1);
}

/**
 * The refusal for ports already held, naming each holder and whether it is
 * this checkout's, or `null` when every port is free.
 *
 * decisions/849-e2e-names-port-holders.md
 */
export function portsRefusal(
  holders: readonly PortHolder[],
  checkout: string | null
): string | null {
  if (holders.length === 0) return null;

  const own = holders.filter((holder) => checkout !== null && holder.checkout === checkout);
  const rows = holders.map(({ port, pid, command, checkout: where }) => {
    const place = own.some((holder) => holder.pid === pid)
      ? "this checkout"
      : (where ?? "no checkout");
    return `  ${port}  pid ${pid}  ${command}  ${place}`;
  });
  const advice: string[] = [];
  if (own.length > 0) {
    const pids = [...new Set(own.map((holder) => holder.pid))].join(" ");
    advice.push(`This checkout's, so left over unless a run is going here: kill ${pids}`);
  }
  if (own.length < holders.length) {
    advice.push(
      "Held from elsewhere, most likely a run in another checkout: wait for it. Only with E2E_TASO_STUB=1 can E2E_PORT, E2E_TASO_PORT and E2E_REDIS_PORT run one beside it, as the stand-in gives each port its own database and Redis."
    );
  }
  return ["Refused: e2e's ports are taken.", ...rows, "", ...advice].join("\n");
}
