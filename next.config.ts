// From `@sentry/nextjs/config`, not the package root: the root export is
// deprecated as of 10.73.0 and stops working in v11, and it printed a warning
// on every build until #293.
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * The Finnish prefix each head-to-head route is reached by, and the directory
 * behind it (specs/042).
 *
 * **Five, because every match page builds its link from its own prefix.** The
 * two national-team routes have theirs, so without them the link on Finland's
 * match pages would lead nowhere.
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
 * it (specs/012-finnish-urls-english-code.md, CLAUDE.md's split).
 *
 * **One table, read twice.** A page needs a rewrite from its URL to its folder
 * and a redirect from the folder's path back to the URL, because a rewrite
 * does not block its own target: without the redirect the page answers on two
 * addresses. The two lists used to be kept by hand, and eight pages had the
 * rewrite alone (#527). Both are now made from this table, so a page cannot
 * have one without the other, and `tests/unit/next-config.test.ts` fails if a
 * rewrite appears that did not come from here.
 */
const ROUTES: ReadonlyArray<readonly [url: string, folder: string]> = [
  // The account settings page, added in specs/024-account-settings.md.
  ["/asetukset", "/settings"],
  // The favourites page, added in specs/026-favourites.md.
  ["/suosikit", "/favorites"],
  // The admin area, added in specs/028-admin-tools-and-roles.md.
  ["/yllapito", "/admin"],
  // The forced season refresh, added in specs/029-forced-season-refresh.md.
  // `data` rather than a provider's name: the page covers both Kotimaa and
  // Ulkomaat, and neither belongs in the path.
  ["/yllapito/data", "/admin/data"],
  // The privacy policy, added in #302.
  ["/tietosuoja", "/privacy"],
  // The terms of service, added in #303.
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
  // The two national teams are TASO's, not football-data's, so their
  // matches cannot share `/maajoukkueet/ottelu/:id` — the id spaces are
  // independent and 317 ids already exist in both tables. See
  // specs/019-match-page.md.
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
  // The same shape for the third region, added in specs/016.
  ["/maajoukkueet/standings", "/maajoukkueet/sarjataulukko"],
  ["/maajoukkueet/matches", "/maajoukkueet/ottelut"],
  ["/maajoukkueet/team/:id", "/maajoukkueet/joukkue/:id"],
  // The match pages added in specs/019, closed on both spellings like
  // every URL above them.
  ["/kotimaa/match/:id", "/kotimaa/ottelu/:id"],
  ["/ulkomaat/match/:id", "/ulkomaat/ottelu/:id"],
  ["/maajoukkueet/match/:id", "/maajoukkueet/ottelu/:id"],
  ["/maajoukkueet/huuhkajat/match/:id", "/maajoukkueet/huuhkajat/ottelu/:id"],
  ["/maajoukkueet/helmarit/match/:id", "/maajoukkueet/helmarit/ottelu/:id"],
];

const nextConfig: NextConfig = {
  // Public URLs are Finnish; the App Router folders are English. `ROUTES` is
  // the only place the two meet — the browser always shows the Finnish path.
  async rewrites() {
    return ROUTES.map(([url, folder]) => ({ source: url, destination: folder }));
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
      // English folder paths are not URLs.
      ...ROUTES.map(([url, folder]) => [folder, url] as const),
      ...OTHER_SPELLINGS,
    ].map(([source, destination]) => ({ source, destination, permanent: true }));
  },

  experimental: {
    serverActions: {
      /**
       * Raised from Next's default of 1 MB, for the avatar upload in
       * specs/025-custom-avatar.md.
       *
       * Without this the app's own 8 MB cap would be fiction: Next rejects an
       * oversized action body with a 413 *before* the action runs, so every
       * upload between 1 MB and 8 MB — which is most phone photographs — would
       * fail as a rejected invocation rather than as the "image is too large"
       * notice, and that notice would be unreachable except for files the
       * client already refused.
       *
       * 10 MB against a cap of 8: the gap absorbs multipart framing, which is
       * bytes on the wire that are not bytes of the image. The app's cap stays
       * the one the reader meets.
       */
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
