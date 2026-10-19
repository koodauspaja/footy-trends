import { createServer } from "node:http";
import { answer, loadFixture } from "./taso-stub";

/**
 * Starts the stand-in for TASO that the e2e suite's server is pointed at, on
 * `E2E_TASO_PORT` (3002 unless set). Playwright starts it beside the app.
 *
 * decisions/672-e2e-without-the-provider.md
 */

const PORT = Number(process.env.E2E_TASO_PORT ?? "3002");
const fixture = loadFixture();

createServer((request, response) => {
  const { status, body } = answer(fixture, request.url ?? "/");
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}).listen(PORT, () => {
  process.stdout.write(`TASO stand-in listening on ${PORT}\n`);
});
