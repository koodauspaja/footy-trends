import { describe, expect, it, vi } from "vitest";
import {
  HEALTH_PROVIDERS_HEADER,
  HEALTH_PROVIDERS_TOKEN,
  providersCheckAllowed,
} from "@/lib/health-providers";

/**
 * The token that lets a request make the health endpoint call TASO.
 *
 * decisions/814-health-providers-token.md
 */

const TOKEN = "a-token-only-the-monitor-knows";

function headersWith(value?: string) {
  return new Headers(value === undefined ? {} : { [HEALTH_PROVIDERS_HEADER]: value });
}

describe("providersCheckAllowed", () => {
  it("allows a request carrying the token", () => {
    expect(providersCheckAllowed(headersWith(TOKEN), { [HEALTH_PROVIDERS_TOKEN]: TOKEN })).toBe(
      true
    );
  });

  it("refuses a request without the header", () => {
    expect(providersCheckAllowed(headersWith(), { [HEALTH_PROVIDERS_TOKEN]: TOKEN })).toBe(false);
  });

  it("refuses a request carrying another value, of any length", () => {
    const env = { [HEALTH_PROVIDERS_TOKEN]: TOKEN };

    expect(providersCheckAllowed(headersWith(`${TOKEN}x`), env)).toBe(false);
    expect(providersCheckAllowed(headersWith(TOKEN.slice(1)), env)).toBe(false);
    expect(providersCheckAllowed(headersWith(""), env)).toBe(false);
  });

  it("refuses everyone when the environment holds no token", () => {
    expect(providersCheckAllowed(headersWith(""), {})).toBe(false);
    expect(providersCheckAllowed(headersWith(TOKEN), {})).toBe(false);
  });

  it("refuses everyone when the token is blank, an empty header included", () => {
    expect(providersCheckAllowed(headersWith(""), { [HEALTH_PROVIDERS_TOKEN]: "  " })).toBe(false);
    expect(providersCheckAllowed(headersWith("  "), { [HEALTH_PROVIDERS_TOKEN]: "  " })).toBe(
      false
    );
  });

  it("reads the process environment by default", () => {
    vi.stubEnv(HEALTH_PROVIDERS_TOKEN, TOKEN);
    try {
      expect(providersCheckAllowed(headersWith(TOKEN))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
