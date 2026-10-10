/**
 * Next's configuration: the route table behind every Finnish URL, the
 * server-action body limit, and Sentry's build settings.
 *
 * decisions/012-finnish-urls-english-code.md
 * decisions/025-custom-avatar.md
 * decisions/042-head-to-head-view.md
 * decisions/293-sentry-config-subpath.md
 * decisions/527-one-route-table.md
 */

// From `@sentry/nextjs/config`, not the package root, whose export is
// deprecated and stops working in v11.
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * The Finnish prefix each head-to-head route is reached by, and the directory
 * behind it. Five, because every match page builds its link from its own
 * prefix.
 *
 * decisions/042-head-to-head-view.md
 */
const HEAD_TO_HEAD_PREFIXES = [
  ["/kotimaa", "/domestic"],
  ["/ulkomaat", "/foreign"],
  ["/maajoukkueet", "/national-teams"],
  ["/maajoukkueet/huuhkajat", "/national-teams/mens-team"],
  ["/maajoukkueet/helmarit", "/national-teams/womens-team"],
] as const;

/**
 * Every page: its Finnish URL, and the English App Router folder that serves
 * it. One table, read twice: a rewrite from the URL to the folder, and a
 * redirect from the folder's path back to the URL.
 *
 * decisions/012-finnish-urls-english-code.md
 * decisions/527-one-route-table.md
 */
const ROUTES: ReadonlyArray<readonly [url: string, folder: string]> = [
  // The account settings page.
  ["/asetukset", "/settings"],
  // The favourites page.
  ["/suosikit", "/favorites"],
  // The admin area.
  ["/yllapito", "/admin"],
  // The forced season refresh. `data`, not a provider's name: the page covers
  // both Kotimaa and Ulkomaat.
  ["/yllapito/data", "/admin/data"],
  // The privacy policy.
  ["/tietosuoja", "/privacy"],
  // The terms of service.
  ["/kayttoehdot", "/terms"],
  ["/ennusteet", "/predictions"],
  ["/kotimaa", "/domestic"],
  ["/kotimaa/joukkue/:id", "/domestic/team/:id"],
  ["/kotimaa/ottelu/:id", "/domestic/match/:id"],
  ["/kotimaa/ottelut", "/domestic/matches"],
  ["/kotimaa/sarjataulukko", "/domestic/standings"],
  ["/ulkomaat", "/foreign"],
  ["/ulkomaat/joukkue/:id", "/foreign/team/:id"],
  ["/ulkomaat/ottelu/:id", "/foreign/match/:id"],
  ["/ulkomaat/ottelut", "/foreign/matches"],
  ["/ulkomaat/sarjataulukko", "/foreign/standings"],
  ["/maajoukkueet", "/national-teams"],
  ["/maajoukkueet/joukkue/:id", "/national-teams/team/:id"],
  ["/maajoukkueet/ottelu/:id", "/national-teams/match/:id"],
  ["/maajoukkueet/ottelut", "/national-teams/matches"],
  ["/maajoukkueet/sarjataulukko", "/national-teams/standings"],
  ["/maajoukkueet/huuhkajat", "/national-teams/mens-team"],
  ["/maajoukkueet/helmarit", "/national-teams/womens-team"],
  // The two national teams are TASO's, not football-data's, so their matches
  // cannot share `/maajoukkueet/ottelu/:id`: the id spaces are independent.
  ["/maajoukkueet/huuhkajat/ottelu/:id", "/national-teams/mens-team/match/:id"],
  ["/maajoukkueet/helmarit/ottelu/:id", "/national-teams/womens-team/match/:id"],
  // Each prefix's `kohtaamiset` route, which names two teams rather than one match.
  ...HEAD_TO_HEAD_PREFIXES.map(
    ([prefix, directory]) =>
      [`${prefix}/kohtaamiset/:a/:b`, `${directory}/head-to-head/:a/:b`] as const
  ),
];

/**
 * Other spellings that lead to a page: addresses from before a move, and a
 * Finnish prefix with an English last segment. None of them is a folder, so
 * none has a rewrite, and each is listed by hand.
 *
 * decisions/012-finnish-urls-english-code.md
 * decisions/527-one-route-table.md
 */
const OTHER_SPELLINGS: ReadonlyArray<readonly [source: string, url: string]> = [
  // The foreign pages moved under /ulkomaat.
  ["/sarjataulukko", "/ulkomaat/sarjataulukko"],
  ["/ottelut", "/ulkomaat/ottelut"],
  ["/joukkue/:id", "/ulkomaat/joukkue/:id"],
  // The English paths that answered 200 before the rename. The folders
  // they were served from are gone, so without these they 404 rather
  // than reaching the Finnish page a bookmark or search index expects.
  ["/standings", "/ulkomaat/sarjataulukko"],
  ["/matches", "/ulkomaat/ottelut"],
  ["/team/:id", "/ulkomaat/joukkue/:id"],
  ["/kotimaa/standings", "/kotimaa/sarjataulukko"],
  ["/kotimaa/matches", "/kotimaa/ottelut"],
  ["/kotimaa/team/:id", "/kotimaa/joukkue/:id"],
  // The same shape under /ulkomaat. These never answered before the
  // move, but the spec closes the English spelling of every Finnish URL
  // that exists now, not only the ones that once resolved.
  ["/ulkomaat/standings", "/ulkomaat/sarjataulukko"],
  ["/ulkomaat/matches", "/ulkomaat/ottelut"],
  ["/ulkomaat/team/:id", "/ulkomaat/joukkue/:id"],
  // The same shape for the third region.
  ["/maajoukkueet/standings", "/maajoukkueet/sarjataulukko"],
  ["/maajoukkueet/matches", "/maajoukkueet/ottelut"],
  ["/maajoukkueet/team/:id", "/maajoukkueet/joukkue/:id"],
  // The match pages, closed on both spellings like every URL above them.
  ["/kotimaa/match/:id", "/kotimaa/ottelu/:id"],
  ["/ulkomaat/match/:id", "/ulkomaat/ottelu/:id"],
  ["/maajoukkueet/match/:id", "/maajoukkueet/ottelu/:id"],
  ["/maajoukkueet/huuhkajat/match/:id", "/maajoukkueet/huuhkajat/ottelu/:id"],
  ["/maajoukkueet/helmarit/match/:id", "/maajoukkueet/helmarit/ottelu/:id"],
];

const nextConfig: NextConfig = {
  // Public URLs are Finnish; the App Router folders are English. `ROUTES` is
  // the only place the two meet — the browser always shows the Finnish path.
  rewrites() {
    return Promise.resolve(ROUTES.map(([url, folder]) => ({ source: url, destination: folder })));
  },

  // Redirects are checked before rewrites, which is what makes pairing them
  // safe. `permanent: true` emits 308 and preserves the request method; query
  // strings are forwarded automatically.
  redirects() {
    return Promise.resolve(
      [
        // English folder paths are not URLs.
        ...ROUTES.map(([url, folder]) => [folder, url] as const),
        ...OTHER_SPELLINGS,
      ].map(([source, destination]) => ({ source, destination, permanent: true }))
    );
  },

  experimental: {
    serverActions: {
      // Raised from Next's default of 1 MB for the avatar upload, whose own cap is
      // 8 MB: Next rejects an oversized action body before the action runs.
      bodySizeLimit: "10mb",
    },
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

  // Routes browser requests to Sentry through a Next.js rewrite, past
  // ad-blockers. The route must not match the app's middleware.
  tunnelRoute: "/monitoring",

  webpack: {
    // Automatic instrumentation of Vercel Cron Monitors. Does not yet work with
    // App Router route handlers.
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
