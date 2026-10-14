import { describe, expect, it } from "vitest";
import {
  DATA_COLLECTION,
  DEFAULT_TRACES_SAMPLE_RATE,
  DENIED_NAME_PARTS,
  sampleRateFrom,
} from "@/lib/sentry-config";

/**
 * Sentry's shared settings: the sample rate read from the environment, and what
 * an event may carry.
 *
 * decisions/140-sentry-production-configuration.md
 * decisions/565-sentry-11.md
 * decisions/656-e2e-sends-nothing-to-sentry.md
 */

describe("sampleRateFrom", () => {
  it("reads a rate the operator set", () => {
    expect(sampleRateFrom("0.1")).toBe(0.1);
    expect(sampleRateFrom("1")).toBe(1);
    expect(sampleRateFrom("0")).toBe(0);
  });

  it("falls back when the variable is unset", () => {
    expect(sampleRateFrom(undefined)).toBe(DEFAULT_TRACES_SAMPLE_RATE);
  });

  it("samples a tenth when nothing is set, so no environment traces every request", () => {
    expect(DEFAULT_TRACES_SAMPLE_RATE).toBe(0.1);
  });

  it("falls back on an empty variable rather than switching tracing off", () => {
    // `Number("")` is 0. A variable copied from .env.example, or added in a
    // dashboard without a value, would otherwise disable tracing entirely
    // while looking configured.
    expect(sampleRateFrom("")).toBe(DEFAULT_TRACES_SAMPLE_RATE);
    expect(sampleRateFrom("   ")).toBe(DEFAULT_TRACES_SAMPLE_RATE);
  });

  it("falls back on a value that is not a number", () => {
    // `Number("high")` is NaN, which Sentry would read as a rate of nothing.
    expect(sampleRateFrom("high")).toBe(DEFAULT_TRACES_SAMPLE_RATE);
  });

  it("rejects a rate outside 0–1 rather than passing it on", () => {
    expect(sampleRateFrom("-0.5")).toBe(DEFAULT_TRACES_SAMPLE_RATE);
    expect(sampleRateFrom("2")).toBe(DEFAULT_TRACES_SAMPLE_RATE);
  });

  it("honours an explicit fallback", () => {
    expect(sampleRateFrom(undefined, 0.25)).toBe(0.25);
  });
});

describe("DATA_COLLECTION", () => {
  it("states every category, so none takes Sentry's collect-everything default", () => {
    expect(DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: DENIED_NAME_PARTS },
        response: { deny: DENIED_NAME_PARTS },
      },
      httpBodies: [],
      urlQueryParams: { deny: DENIED_NAME_PARTS },
      graphQL: { document: true, variables: true },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: true,
      frameContextLines: 7,
    });
  });
});

describe("DENIED_NAME_PARTS", () => {
  // Sentry denies a name when it contains any part, case-insensitively.
  const denied = (name: string) =>
    DENIED_NAME_PARTS.some((part) => name.toLowerCase().includes(part));

  it("denies the names that carry an address or a proxy hop", () => {
    for (const name of [
      "X-Forwarded-For",
      "Forwarded",
      "X-Real-IP",
      "Via",
      "Remote-Addr",
      "X-Remote-User",
    ]) {
      expect(denied(name), name).toBe(true);
    }
  });

  it("denies the names that carry a credential", () => {
    for (const name of [
      "Cookie",
      "Set-Cookie",
      "Authorization",
      "X-Auth-Token",
      "X-Api-Key",
      "X-Session-Id",
      "Client-Secret",
      "token",
    ]) {
      expect(denied(name), name).toBe(true);
    }
  });

  it("keeps the names that help debugging", () => {
    for (const name of ["User-Agent", "Accept", "Content-Type", "Host", "Referer", "team"]) {
      expect(denied(name), name).toBe(false);
    }
  });
});
