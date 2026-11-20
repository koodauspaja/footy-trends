/**
 * The security headers every response carries, read by `next.config.ts` at
 * build time. The content security policy is report-only.
 *
 * decisions/808-security-headers.md
 */

export type Header = { key: string; value: string };

/**
 * Where a browser posts its CSP violation reports: the Sentry project's security
 * endpoint, built from the browser DSN. Null without a DSN, or with one that does
 * not parse, and then the policy names no endpoint.
 *
 * decisions/808-security-headers.md
 */
export function cspReportUri(dsn: string | undefined): string | null {
  // The parser drops surrounding spaces itself, and answers a blank with null.
  const url = dsn === undefined ? null : URL.parse(dsn);
  if (url === null) return null;
  const project = url.pathname.replace(/^\/+|\/+$/g, "");
  if (url.protocol !== "https:" || url.username === "" || !/^\d+$/.test(project)) return null;
  return `https://${url.host}/api/${project}/security/?sentry_key=${url.username}`;
}

/**
 * The policy, one directive per entry. Inline scripts and styles stay allowed
 * because Next's own bootstrap is inline and the cached pages cannot carry a
 * per-request nonce. Images may come from any HTTPS host, because crests and
 * avatars do.
 *
 * decisions/808-security-headers.md
 */
export function contentSecurityPolicy(options: {
  development: boolean;
  reportUri: string | null;
}): string {
  const directives = [
    "default-src 'self'",
    // React's development build evaluates strings for its debugging tools.
    `script-src 'self' 'unsafe-inline'${options.development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.reportUri === null ? [] : [`report-uri ${options.reportUri}`]),
  ];
  return directives.join("; ");
}

/**
 * Every header, for every route.
 *
 * decisions/808-security-headers.md
 */
export function securityHeaders(env: {
  NODE_ENV?: string | undefined;
  NEXT_PUBLIC_SENTRY_DSN?: string | undefined;
}): Header[] {
  return [
    // Two years. No `includeSubDomains`: the host is Railway's, and this app
    // speaks for no name below it.
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    {
      key: "Content-Security-Policy-Report-Only",
      value: contentSecurityPolicy({
        development: env.NODE_ENV === "development",
        reportUri: cspReportUri(env.NEXT_PUBLIC_SENTRY_DSN),
      }),
    },
  ];
}
