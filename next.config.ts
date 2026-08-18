import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework/version.
  poweredByHeader: false,
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
    const LEGACY_ADMIN = "login|set-password|analytics|category-sweep|collabs-links|collections|conversions|data|editors-picks|emails|giveaway|intake-accuracy|key-metrics|listing-quality|market-data|removed-items|returns|search-analytics|session-flows|sourcing|stores|summary|sync|users|waitlist|webhooks";
    const isDev = process.env.NODE_ENV !== "production";
    return {
      beforeFiles: [
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
