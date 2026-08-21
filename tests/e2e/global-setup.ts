import { existsSync } from "node:fs";

/**
 * Fails fast with a clear message when a provider API key is missing,
 * instead of letting every test time out waiting on pages that silently
 * render the generic error state. This suite runs against the real
 * football-data.org and TASO APIs, not mocks — see tests/e2e/README.md.
 */
export default function globalSetup() {
  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  if (!process.env.FOOTBALL_DATA_API_KEY) {
    throw new Error(
      "FOOTBALL_DATA_API_KEY is not set. tests/e2e runs against the real " +
        "football-data.org API — set it in .env before running npm run test:e2e " +
        "(see README.md's Quick Start)."
    );
  }

  if (!process.env.TASO_API_KEY) {
    throw new Error(
      "TASO_API_KEY is not set. tests/e2e runs against the real TASO API " +
        "(Veikkausliiga) — set it in .env before running npm run test:e2e " +
        "(see docs/setup/020-taso-api-key.md)."
    );
  }
}
