import { describe, expect, it } from "vitest";
import { DEFAULT_TRACES_SAMPLE_RATE, flagFrom, sampleRateFrom } from "@/lib/sentry-config";

describe("sampleRateFrom", () => {
  it("reads a rate the operator set", () => {
    expect(sampleRateFrom("0.1")).toBe(0.1);
    expect(sampleRateFrom("1")).toBe(1);
    expect(sampleRateFrom("0")).toBe(0);
  });

  it("falls back when the variable is unset", () => {
    expect(sampleRateFrom(undefined)).toBe(DEFAULT_TRACES_SAMPLE_RATE);
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

describe("flagFrom", () => {
  it("turns a flag off on false, whatever its case or spacing", () => {
    expect(flagFrom("false")).toBe(false);
    expect(flagFrom("FALSE")).toBe(false);
    expect(flagFrom(" false ")).toBe(false);
  });

  it("leaves the flag alone for anything else", () => {
    // The failure that matters is a setting silently flipping, not one failing
    // to flip, so a typo leaves it as it was.
    expect(flagFrom("true")).toBe(true);
    expect(flagFrom("no")).toBe(true);
    expect(flagFrom("0")).toBe(true);
    expect(flagFrom(undefined)).toBe(true);
    expect(flagFrom("")).toBe(true);
  });

  it("honours an explicit fallback", () => {
    expect(flagFrom(undefined, false)).toBe(false);
  });
});
