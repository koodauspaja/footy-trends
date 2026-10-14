import { describe, expect, it } from "vitest";
import {
  DATA_COLLECTION,
  DEFAULT_TRACES_SAMPLE_RATE,
  DENIED_NAME_PARTS,
  filterSpanQueries,
  isDeniedName,
  sampleRateFrom,
  withDeniedQueriesFiltered,
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
      queues: false,
      stackFrameVariables: true,
      frameContextLines: 7,
    });
  });
});

describe("isDeniedName", () => {
  // As Sentry matches the deny list: a name containing any part, case-insensitively.
  const denied = isDeniedName;

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
      "password",
      "X-Passwd",
      "code",
      "state",
      "Referer",
    ]) {
      expect(denied(name), name).toBe(true);
    }
  });

  it("keeps the names that help debugging", () => {
    for (const name of ["User-Agent", "Accept", "Content-Type", "Host", "team"]) {
      expect(denied(name), name).toBe(false);
    }
  });
});

describe("withDeniedQueriesFiltered", () => {
  it("filters the OAuth callback's code and state, and keeps the rest of the query", () => {
    expect(
      withDeniedQueriesFiltered(
        "/api/auth/callback/google?code=4%2F0Ab-secret&state=xyz&scope=email"
      )
    ).toBe("/api/auth/callback/google?code=[Filtered]&state=[Filtered]&scope=email");
  });

  it("filters a denied name whatever its case, and an empty value", () => {
    expect(withDeniedQueriesFiltered("/x?Password=hunter2&token=&team=1")).toBe(
      "/x?Password=[Filtered]&token=[Filtered]&team=1"
    );
  });

  it("matches a name once percent-decoded, its valid escapes even beside a malformed one", () => {
    expect(withDeniedQueriesFiltered("/x?%63ode=abc&%74oken=t&%E0%A4%A=1&to%6Ben%ZZ=v")).toBe(
      "/x?%63ode=[Filtered]&%74oken=[Filtered]&%E0%A4%A=1&to%6Ben%ZZ=[Filtered]"
    );
  });

  it("ends a value at whitespace, and reads a second query in a value as its own", () => {
    expect(withDeniedQueriesFiltered("GET /x?code=abc HTTP/1.1")).toBe(
      "GET /x?code=[Filtered] HTTP/1.1"
    );
    expect(withDeniedQueriesFiltered("/x?next=/y?state=s2&team=1")).toBe(
      "/x?next=/y?state=[Filtered]&team=1"
    );
  });

  it("leaves a name with no value and a lone separator alone", () => {
    expect(withDeniedQueriesFiltered("/x?code&token&=v?")).toBe("/x?code&token&=v?");
    expect(withDeniedQueriesFiltered("/x?code#c=1 ?token x=2")).toBe("/x?code#c=1 ?token x=2");
  });

  it("stops a value at a fragment, so a full referer stays intact around it", () => {
    expect(withDeniedQueriesFiltered("https://example.com/a?state=s1#top")).toBe(
      "https://example.com/a?state=[Filtered]#top"
    );
  });

  it("leaves text with no denied query parameter as it was", () => {
    expect(withDeniedQueriesFiltered("GET /kotimaa/sarjataulukko?kausi=2026&team=1")).toBe(
      "GET /kotimaa/sarjataulukko?kausi=2026&team=1"
    );
    expect(withDeniedQueriesFiltered("Router")).toBe("Router");
  });
});

describe("filterSpanQueries", () => {
  const span = {
    trace_id: "t",
    span_id: "s",
    name: "GET /api/auth/callback/google?code=abc",
    start_timestamp: 1,
    status: "ok" as const,
    is_segment: true,
    attributes: {
      "http.target": "/api/auth/callback/google?code=abc&state=def",
      "http.request.header.referer": ["https://example.com/?token=t1&team=1"],
      "url.full": { value: "https://example.com/?code=abc" },
      "http.response.status_code": 302,
      "sentry.op": "http.server",
    },
  };

  it("filters denied query values in the name and in string, list and object attributes", () => {
    expect(filterSpanQueries(span)).toEqual({
      ...span,
      name: "GET /api/auth/callback/google?code=[Filtered]",
      attributes: {
        "http.target": "/api/auth/callback/google?code=[Filtered]&state=[Filtered]",
        "http.request.header.referer": ["https://example.com/?token=[Filtered]&team=1"],
        "url.full": { value: "https://example.com/?code=[Filtered]" },
        "http.response.status_code": 302,
        "sentry.op": "http.server",
      },
    });
  });
});
