import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, cspReportUri, securityHeaders } from "@/lib/security-headers";

/**
 * The headers every response carries, and the report-only policy among them.
 *
 * decisions/808-security-headers.md
 */

const DSN = "https://0123abcd@o4507.ingest.de.sentry.io/4508";
const REPORT_URI = "https://o4507.ingest.de.sentry.io/api/4508/security/?sentry_key=0123abcd";

function directives(policy: string): string[] {
  return policy.split("; ");
}

function headerMap(env: Parameters<typeof securityHeaders>[0]): Map<string, string> {
  return new Map(securityHeaders(env).map(({ key, value }) => [key, value]));
}

describe("cspReportUri", () => {
  it("builds the Sentry project's security endpoint from the DSN", () => {
    expect(cspReportUri(DSN)).toBe(REPORT_URI);
  });

  it("reads a DSN with surrounding spaces or a trailing slash the same way", () => {
    expect(cspReportUri(`  ${DSN}/ `)).toBe(REPORT_URI);
  });

  it.each([
    ["unset", undefined],
    ["blank", "   "],
    ["not a URL", "not a dsn"],
    ["without a key", "https://o4507.ingest.de.sentry.io/4508"],
    ["over plain HTTP", "http://0123abcd@o4507.ingest.de.sentry.io/4508"],
    ["with no project", "https://0123abcd@o4507.ingest.de.sentry.io/"],
    ["with a path before the project", "https://0123abcd@sentry.example.com/sentry/4508"],
    ["with a path after the project", "https://0123abcd@o4507.ingest.de.sentry.io/4508/extra"],
  ])("names no endpoint for a DSN that is %s", (_case, dsn) => {
    expect(cspReportUri(dsn)).toBeNull();
  });
});

describe("contentSecurityPolicy", () => {
  it("allows only the app's own origin by default, and no framing, plugins or foreign forms", () => {
    expect(directives(contentSecurityPolicy({ development: false, reportUri: null }))).toEqual([
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ]);
  });

  it("allows eval in development only", () => {
    expect(directives(contentSecurityPolicy({ development: true, reportUri: null }))).toContain(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    );
  });

  it("names the report endpoint last when there is one", () => {
    expect(
      directives(contentSecurityPolicy({ development: false, reportUri: REPORT_URI })).at(-1)
    ).toBe(`report-uri ${REPORT_URI}`);
  });
});

describe("securityHeaders", () => {
  it("sets every header, with the policy report-only", () => {
    expect(headerMap({ NODE_ENV: "production" })).toEqual(
      new Map([
        ["Strict-Transport-Security", "max-age=63072000"],
        ["X-Content-Type-Options", "nosniff"],
        ["X-Frame-Options", "DENY"],
        ["Referrer-Policy", "strict-origin-when-cross-origin"],
        [
          "Permissions-Policy",
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
        ],
        [
          "Content-Security-Policy-Report-Only",
          contentSecurityPolicy({ development: false, reportUri: null }),
        ],
      ])
    );
  });

  it("never enforces the policy", () => {
    expect(headerMap({ NODE_ENV: "production" }).has("Content-Security-Policy")).toBe(false);
  });

  it("reports to Sentry when the browser DSN is set", () => {
    const policy = headerMap({ NODE_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: DSN }).get(
      "Content-Security-Policy-Report-Only"
    );

    expect(policy).toBe(contentSecurityPolicy({ development: false, reportUri: REPORT_URI }));
  });

  it("relaxes the policy for the development server", () => {
    expect(headerMap({ NODE_ENV: "development" }).get("Content-Security-Policy-Report-Only")).toBe(
      contentSecurityPolicy({ development: true, reportUri: null })
    );
  });
});
