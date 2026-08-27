import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Public URLs are Finnish; the App Router folders are English, per
  // CLAUDE.md's split. These rewrites are the only place the two meet — the
  // browser always shows the Finnish path.
  async rewrites() {
    return [
      { source: "/kotimaa", destination: "/domestic" },
      { source: "/kotimaa/joukkue/:id", destination: "/domestic/team/:id" },
      { source: "/kotimaa/ottelut", destination: "/domestic/matches" },
      { source: "/kotimaa/sarjataulukko", destination: "/domestic/standings" },
      { source: "/ulkomaat", destination: "/foreign" },
      { source: "/ulkomaat/joukkue/:id", destination: "/foreign/team/:id" },
      { source: "/ulkomaat/ottelut", destination: "/foreign/matches" },
      { source: "/ulkomaat/sarjataulukko", destination: "/foreign/standings" },
      { source: "/maajoukkueet", destination: "/national-teams" },
      { source: "/maajoukkueet/joukkue/:id", destination: "/national-teams/team/:id" },
      { source: "/maajoukkueet/ottelut", destination: "/national-teams/matches" },
      { source: "/maajoukkueet/sarjataulukko", destination: "/national-teams/standings" },
    ];
  },

  /**
   * Redirects are checked before rewrites, which is what makes pairing them
   * safe: a Finnish URL matches no redirect and is rewritten internally,
   * and an internal rewrite never re-enters this table, so the two cannot
   * bounce off each other. Verified on a running server — see spec 012.
   *
   * `permanent: true` emits 308 and preserves the request method. Query
   * strings are forwarded automatically, so `?kilpailu=` and `?kausi=`
   * survive without any `:path*` handling.
   */
  async redirects() {
    return [
      // The foreign pages moved under /ulkomaat.
      { source: "/sarjataulukko", destination: "/ulkomaat/sarjataulukko", permanent: true },
      { source: "/ottelut", destination: "/ulkomaat/ottelut", permanent: true },
      { source: "/joukkue/:id", destination: "/ulkomaat/joukkue/:id", permanent: true },
      // The English paths that answered 200 before the rename. The folders
      // they were served from are gone, so without these they 404 rather
      // than reaching the Finnish page a bookmark or search index expects.
      { source: "/standings", destination: "/ulkomaat/sarjataulukko", permanent: true },
      { source: "/matches", destination: "/ulkomaat/ottelut", permanent: true },
      { source: "/team/:id", destination: "/ulkomaat/joukkue/:id", permanent: true },
      { source: "/kotimaa/standings", destination: "/kotimaa/sarjataulukko", permanent: true },
      { source: "/kotimaa/matches", destination: "/kotimaa/ottelut", permanent: true },
      { source: "/kotimaa/team/:id", destination: "/kotimaa/joukkue/:id", permanent: true },
      // The same shape under /ulkomaat. These never answered before the
      // move, but the spec closes the English spelling of every Finnish URL
      // that exists now, not only the ones that once resolved.
      { source: "/ulkomaat/standings", destination: "/ulkomaat/sarjataulukko", permanent: true },
      { source: "/ulkomaat/matches", destination: "/ulkomaat/ottelut", permanent: true },
      { source: "/ulkomaat/team/:id", destination: "/ulkomaat/joukkue/:id", permanent: true },
      // English folder paths are not URLs. A rewrite does not block its own
      // target, so without these every page would answer on two addresses.
      { source: "/domestic", destination: "/kotimaa", permanent: true },
      { source: "/domestic/standings", destination: "/kotimaa/sarjataulukko", permanent: true },
      { source: "/domestic/matches", destination: "/kotimaa/ottelut", permanent: true },
      { source: "/domestic/team/:id", destination: "/kotimaa/joukkue/:id", permanent: true },
      // The same shape for the third region, added in specs/016.
      {
        source: "/maajoukkueet/standings",
        destination: "/maajoukkueet/sarjataulukko",
        permanent: true,
      },
      { source: "/maajoukkueet/matches", destination: "/maajoukkueet/ottelut", permanent: true },
      {
        source: "/maajoukkueet/team/:id",
        destination: "/maajoukkueet/joukkue/:id",
        permanent: true,
      },
      { source: "/national-teams", destination: "/maajoukkueet", permanent: true },
      {
        source: "/national-teams/standings",
        destination: "/maajoukkueet/sarjataulukko",
        permanent: true,
      },
      { source: "/national-teams/matches", destination: "/maajoukkueet/ottelut", permanent: true },
      {
        source: "/national-teams/team/:id",
        destination: "/maajoukkueet/joukkue/:id",
        permanent: true,
      },
      { source: "/foreign", destination: "/ulkomaat", permanent: true },
      { source: "/foreign/standings", destination: "/ulkomaat/sarjataulukko", permanent: true },
      { source: "/foreign/matches", destination: "/ulkomaat/ottelut", permanent: true },
      { source: "/foreign/team/:id", destination: "/ulkomaat/joukkue/:id", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "koodauspaja",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
