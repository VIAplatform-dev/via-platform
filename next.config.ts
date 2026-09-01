import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build dir is overridable so a second dev server (the getvya.ai OS surface via `npm run dev:os`)
  // can run alongside the marketplace one without fighting over `.next/dev/lock`. Defaults to `.next`
  // everywhere (build/start/CI unchanged); only dev:os sets NEXT_DIST_DIR=.next-os.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Plan B serves each store from its own hostname, and in DEV those are `{slug}.vyasites.test`.
  // Next blocks cross-origin requests for dev-only assets by default, so on a store host every
  // `/_next/static/chunks/*.js` came back 403 — which meant VYA's own checkout page, the one page
  // every hosted-store shopper is sent to, never hydrated and sat on "Loading…" forever. Dev only:
  // in production those assets are served normally and this setting does nothing.
  allowedDevOrigins: ["*.vyasites.test", "*.vyasites.com"],
  // Don't advertise the framework/version.
  poweredByHeader: false,
  // Required by the /ingest reverse proxy below: PostHog's API paths are trailing-slash sensitive,
  // and Next's default redirect would turn each capture into a 308 the SDK doesn't follow.
  skipTrailingSlashRedirect: true,
  // Baseline security headers on every response. Deliberately NOT a full content-security-policy
  // (that risks breaking inline scripts/embeds and needs its own rollout); frame-ancestors here
  // gives robust clickjacking protection without touching resource loading.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
  async redirects() {
    const socialSources = [
      { path: "instagram", source: "instagram", campaign: "instagram_bio" },
      { path: "ig",        source: "instagram", campaign: "instagram_bio" },
      { path: "tiktok",   source: "tiktok",    campaign: "tiktok_bio" },
      { path: "tt",        source: "tiktok",    campaign: "tiktok_bio" },
      { path: "linkedin",  source: "linkedin",  campaign: "linkedin_bio" },
      { path: "li",        source: "linkedin",  campaign: "linkedin_bio" },
      { path: "pinterest", source: "pinterest", campaign: "pinterest_bio" },
      { path: "threads",   source: "threads",   campaign: "threads_bio" },
      { path: "facebook",  source: "facebook",  campaign: "facebook_bio" },
      { path: "youtube",   source: "youtube",   campaign: "youtube_bio" },
      { path: "substack",  source: "substack",  campaign: "substack_bio" },
    ];

    return [
      {
        source: "/categories/clothes",
        destination: "/categories/clothing",
        permanent: true,
      },
      // The recommerce pages moved to the owner's infrastructure workspace. Only these
      // four were removed from /store, so redirecting them is safe (they 404 otherwise);
      // the rest of /store stays live for real sellers.
      // Sellers' store portal lands on the classic dashboard (performance + sales), not the
      // newer infra-style home. Repointed per the store owner — keep sellers on /store/dashboard.
      { source: "/store/home", destination: "/store/dashboard", permanent: false },
      // Sellers are told "getvya.ai/store/signup" out loud, and people type the hyphen.
      { source: "/store/sign-up", destination: "/store/signup", permanent: false },
      { source: "/store/register", destination: "/store/signup", permanent: false },
      { source: "/store/intake", destination: "/infrastructure/admin/add-listing", permanent: false },
      { source: "/store/items", destination: "/infrastructure/admin/inventory", permanent: false },
      { source: "/store/customers", destination: "/infrastructure/admin/customers", permanent: false },
      { source: "/store/performance", destination: "/infrastructure/admin/performance", permanent: false },
      ...socialSources.map(({ path, source, campaign }) => ({
        source: `/${path}`,
        destination: `/?utm_source=${source}&utm_medium=social&utm_campaign=${campaign}`,
        permanent: false,
      })),
    ];
  },
  async rewrites() {
    // getvya.ai serves the Owner Workspace at a clean /admin, but the routes physically
    // live at /infrastructure/admin (the /admin namespace is taken by the legacy internal
    // panel on vyaplatform.com). This host-conditional rewrite maps them — and because it
    // lives in next.config (not middleware), the client router honors it, so in-workspace
    // navigation is proper SPA nav rather than full reloads. Scoped to the getvya.ai host,
    // so vyaplatform.com/admin (the legacy panel) is untouched.
    const osHosts = [
      { type: "host" as const, value: "getvya.ai" },
      { type: "host" as const, value: "www.getvya.ai" },
    ];
    // The LEGACY internal panel lives at app/admin/* (served on vyaplatform.com). These are its
    // top-level segments — in local dev we DON'T rewrite them, so the owner's internal tools stay
    // reachable at /admin/* on localhost alongside the workspace.
    // NOTE: `customers` and `golden-review` exist in BOTH trees. Production has two hosts and the
    // host decides; local dev has one, so one tree has to win at /admin/*. It is the WORKSPACE,
    // deliberately: getvya.ai rewrites both to the workspace, so listing them here made the same
    // nav link open the seller's Customers page on the live site and the old marketplace buyer
    // list on localhost — local testing that lies about the product is worse than a page you have
    // to reach another way. The legacy pages still serve on vyaplatform.com, where that panel
    // lives; they have no second path, so on localhost they yield.
    const LEGACY_ADMIN = "login|set-password|analytics|category-sweep|collabs-links|collections|conversions|data|editors-picks|emails|giveaway|intake-accuracy|key-metrics|listing-quality|market-data|removed-items|returns|search-analytics|session-flows|sourcing|stores|summary|sync|users|waitlist|webhooks";
    const isDev = process.env.NODE_ENV !== "production";
    return {
      beforeFiles: [
        // ── PostHog reverse proxy ────────────────────────────────────────────────────────────
        // Analytics served from our own origin. Sent straight to us.i.posthog.com it is blocked by
        // ad-blockers and by Safari's tracker rules, which would silently take out exactly the
        // sellers whose behaviour we're trying to learn from — a half-sampled funnel is worse than
        // none, because it looks like data. The assets host is separate from the ingest host, so
        // the /static rule has to come first.
        { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
        { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
        ...osHosts.flatMap((h) => [
          { source: "/admin", has: [h], destination: "/infrastructure/admin" },
          // Exclude the auth pages: /admin/login and /admin/set-password must serve the LEGACY
          // app/admin/* pages, which render unauthenticated. The workspace routes are wrapped by
          // a layout that redirects to /admin/login when logged out — so a login page mapped into
          // the workspace tree would redirect to itself forever.
          {
            source: "/admin/:path((?!login|set-password).*)",
            has: [h],
            destination: "/infrastructure/admin/:path",
          },
        ]),
        // Local dev has a single host, so the getvya.ai-scoped rules above never match and the
        // Owner Workspace nav (which points at /admin/*) 404s. Mirror the mapping in dev only, but
        // skip the legacy panel's own segments so app/admin/* (conversions, data, …) still works.
        ...(isDev
          ? [
              { source: "/admin", destination: "/infrastructure/admin" },
              { source: `/admin/:path((?!(?:${LEGACY_ADMIN})(?:/|$)).*)`, destination: "/infrastructure/admin/:path" },
            ]
          : []),
      ],
    };
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Shopify CDN (product images)
      { protocol: "https", hostname: "**.shopify.com" },
      { protocol: "https", hostname: "**.shopifycdn.com" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      // Shopify Collabs CDN
      { protocol: "https", hostname: "**.collabs.shop" },
      // Squarespace (LEI, Montrose Edit)
      { protocol: "https", hostname: "**.squarespace.com" },
      { protocol: "https", hostname: "**.sqspcdn.com" },
      { protocol: "https", hostname: "**.squarespace-cdn.com" },
      // Big Cartel
      { protocol: "https", hostname: "**.bigcartel.com" },
      // Square CDN
      { protocol: "https", hostname: "**.squareup.com" },
      { protocol: "https", hostname: "items-images.squareup.com" },
      // Generic CDNs used by stores
      { protocol: "https", hostname: "**.cloudinary.com" },
      { protocol: "https", hostname: "**.imgix.net" },
      { protocol: "https", hostname: "**.amazonaws.com" },
      // Store custom domains (images served directly from store sites)
      { protocol: "https", hostname: "shopfortheglobe.com" },
      { protocol: "https", hostname: "**.shopfortheglobe.com" },
      // Carroll Street Vintage (images served from their own domain /assets/)
      { protocol: "https", hostname: "carrollstreetvintage.com" },
      // Wix (Nello Vintage)
      { protocol: "https", hostname: "**.wixstatic.com" },
      // Vercel Blob (sourcing request image uploads)
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
