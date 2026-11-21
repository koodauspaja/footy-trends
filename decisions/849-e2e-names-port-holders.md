# 849 — e2e names what holds its ports before it starts: decisions

Chore #849. On 2026-11-21 two e2e starts failed within seconds with messages that did not say who held the port: another checkout's run, or a stopped run's own Next server and TASO stub. Only the second is safe to stop. Now `pretest:e2e` first runs `scripts/e2e/e2e-ports.ts`, which refuses while a port is held and names each holder.

| Decision | Why |
|---|---|
| **Ports only:** the app's port, and the stand-in's TASO and Redis ports when `E2E_TASO_STUB=1`, read as `playwright.config.ts` reads them. The stand-in's container is not looked up | Miikka chose the smallest version (2026-11-22). A live run always holds its port, so the port names the run; a container left without a port holder still stops the run with docker's own message, which names the container |
| **Each holder is named by process id, command and the git checkout of its working directory**, read with `lsof` and `git rev-parse --show-toplevel` | The checkout is what tells a run elsewhere from this checkout's leftovers. A holder whose directory is in no checkout, such as Docker's port proxy, is named as in none |
| **The advice follows the holder:** this checkout's are left over unless a run is going here, with the `kill` line; anyone else's is a run to wait for, or to run beside with `E2E_PORT`, `E2E_TASO_PORT` and `E2E_REDIS_PORT` | The issue's two cases. Nothing is stopped automatically (out of scope) |
| **Without `lsof` the check is skipped, and says so** | It is a convenience before a run, not a gate: the run still fails on a held port as before. `lsof` is at `/usr/sbin/lsof` on macOS and `/usr/bin/lsof` on Linux |
| **`npm run verify` gives e2e as ~7min** | The full runs measured on 2026-11-21 and 2026-11-22 took 6 min 6 s to 6 min 48 s |
