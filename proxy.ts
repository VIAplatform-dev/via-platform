import { NextResponse } from "next/server";
import { storeSlugForHost, isRefusedOnStoreHost, shopifyThemeRoute, shopifyCartSubmitRoute, squarespaceThemeRoute, squarespaceCheckoutRedirect, isVyaOwnedPath } from "@/app/lib/plan-b/store-host";
import type { NextRequest } from "next/server";
import { verifyRecipientTokenEdge } from "@/app/lib/recipientToken-edge";
import { capturedSlugForDomain } from "@/app/lib/domain-routing-edge";

// Routes accessible without any authentication or approval
const PUBLIC_ROUTES = [
  "/pay", // customer-facing "payment sent" pages after a Market Mode QR payment
  // Printed QR codes (/q/{code} → app/q/[code]/route.ts). Whoever picks up a business card
  // has no session and no pilot approval — gating this would send every scan to /login.
  "/q",
  // The printed flyers. Same reasoning as /q, but these are the addresses themselves rather than
  // a redirect, so each one is listed. THE LIST LIVES IN app/lib/flyers.ts — a slug added there
  // and forgotten here sends every scan of that flyer to a sign-in wall, and the paper cannot be
  // redeployed. flyers.test.ts holds the two in step.
  "/vintage",
  "/emma-stolen-bag",
  "/trendsetter",
  "/not-shein",
  "/fashion-clone",
  "/postcard",
  // The form those pages post to. Gating it would let the page render and then refuse the signup.
  "/api/flyer-join",
  "/login",
  "/register",
  "/pilot-pending",
  "/api/pilot-register",
  "/api/pilot-check",
  "/waitlist",
  "/api/waitlist",
  "/admin/login",
  "/admin/set-password",
  "/api/admin/auth",
  // Local-development sign-in. The route itself 404s unless NODE_ENV is development AND the Host is
  // loopback — it must be reachable without a session to be able to CREATE one.
  "/api/admin/dev-login",
  "/api/admin/set-password",
  "/terms",
  "/privacy",
  // The consignor portal signs people in on its own terms: a magic link sets a
  // consignor_session cookie, which is NOT an Auth.js session — so the catch-all
  // gate below would bounce a legitimately signed-in consignor to /login, a
  // store-owner sign-in they have no account for. The page renders its own
  // request-a-link form when signed out, and /api/consignor/verify gates the data.
  "/consignor",
  "/api/consignor",
  "/api/giveaway",
  "/api/cron",
  "/api/test-emails",
  "/for-stores",
  "/partner-with-vya",
  "/infrastructure",
  "/s",
  "/site",
  "/i", // product-image proxy — must be crawlable by Googlebot (reverse-image SEO), like OG images
  "/api/auth",
  "/api/newsletter",
  "/api/contact",
  "/api/track",
  "/api/conversion",
  "/api/access-code",
  "/api/promo-code",
  "/membership",
  "/api/webhooks",
  "/api/admin/collabs-product-ids",
  "/api/admin/import-collabs-links",
  "/api/admin/import-collabs-links-by-shopify-id",
  "/api/admin/purge-store",
  "/api/admin/send-new-arrivals",
  "/api/editors-picks",
  "/api/story",
  "/api/public",
  "/api/mobile",
  "/api/admin/editors-picks",
  "/api/store/me",
  "/api/store/analytics",
  "/api/store/sourcing",
  "/api/store/messages",
  "/api/store/storefront",
  "/api/store/assistant",
  "/api/store/capture",
  "/api/store/assets",
  "/api/store/listings",
  "/api/store/domain",
  "/api/store/payments",
  "/api/store/billing",
  "/api/store/import",
  "/api/store/onboarding-status",
  "/api/store/onboarding",
  "/api/store/policy",
  "/api/store/intake",
  "/api/store/items",
  "/api/store/inventory",
  "/api/store/instagram",
  "/api/store/orders",
  "/api/store/inbox",
  "/api/store/customers",
  "/api/store/collections",
  "/api/store/pricing",
  "/api/store/shipping",
  "/api/store/shopify-connect",
  "/api/store/shopify-oauth",
  "/api/store/connect",
  // eBay OAuth: the callback authenticates via the signed `state` (no session — eBay redirects
  // here cross-domain), and connect/status/setup enforce their own auth (resolveStoreSlugAny).
  // Without this, eBay's redirect to the callback hits the login wall and no token is ever stored.
  "/api/store/cross-listing",
  "/api/checkout",
  "/api/storefront",
  "/checkout",
  "/api/thread",
  "/thread",
  // A shopper negotiating on a seller's storefront is a member of the public — no VYA account,
  // no pilot approval. Their offer-tracking page is authenticated by the unguessable token in the
  // URL, exactly like /thread, and it is what the "track it" link and every offer email point at.
  // Gating it dead-ends the negotiation: the buyer cannot answer a counter, and cannot reach the
  // accepted-price checkout.
  "/offer",
  // A store signing in or signing up has, by definition, no session and no pilot approval yet —
  // gating these behind either is a closed door with the key on the inside. /store/continue is the
  // hop every provider callback returns to, and it must answer for a seller whose session cookie
  // is still a few milliseconds old.
  "/store/login",
  "/store/signup",
  "/store/continue",
  // The identity endpoint the seller flow asks "who is this, and do they have a store yet?".
  // It authenticates itself and answers 401 when nobody is signed in — that 401 IS the answer the
  // sign-in page needs. Left to the catch-all below it was redirected to /login instead, and a
  // seller with a fresh session but no pilot-approval cookie was bounced into the pilot check
  // mid-signup, which is the worst possible moment to be asked to wait for approval.
  "/api/infrastructure/whoami",
  // The PostHog reverse proxy (see next.config). It carries analytics from the seller workspace,
  // which is already behind a session — gating the transport as well would only mean losing events.
  "/ingest",
];

// Routes that require a user session but NOT pilot approval (via_access cookie)
const SESSION_ONLY_ROUTES = [
  "/account",
  "/api/favorites",
  "/api/account",
  "/api/friends",
  "/api/membership",
  "/api/referral-status",
  "/store/dashboard",
  "/store/home",
  "/store/storefront",
  "/store/listings",
  "/store/payments",
  "/store/import",
  "/store/onboarding",
  "/store/intake",
  "/store/items",
  "/store/orders",
  "/store/inbox",
  "/store/customers",
  "/store/settings",
  "/store/connect",
  "/cart",
  "/api/cart",
];

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isAdminAuthenticated(request: NextRequest): Promise<boolean> {
  const expectedToken = process.env.ADMIN_PASSWORD;
  if (!expectedToken) return false;
  // Accept Bearer token in Authorization header (for curl/API access)
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${expectedToken}`) return true;
  // Accept hashed token in cookie (for browser sessions)
  const adminToken = request.cookies.get("via_admin_token")?.value;
  if (!adminToken) return false;
  const expected = await hashPassword(expectedToken);
  return adminToken === expected;
}

function hasUserSession(request: NextRequest): boolean {
  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value;
  return !!sessionToken;
}

function hasAccessCode(request: NextRequest): boolean {
  return request.cookies.get("via_access")?.value === "1";
}

function isPublicRoute(pathname: string): boolean {
  const normalized =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;
  // Product & store pages are gated (waitlist), but their OG/Twitter preview images
  // stay public so a shared link still unfurls with a thumbnail — clicking the link
  // itself hits the login/approval wall. (Locks access, keeps links from looking broken.)
  if (normalized.endsWith("/opengraph-image") || normalized.endsWith("/twitter-image")) return true;
  return PUBLIC_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(route + "/")
  );
}

function isSessionOnlyRoute(pathname: string): boolean {
  const normalized =
    pathname.endsWith("/") && pathname !== "/"
      ? pathname.slice(0, -1)
      : pathname;
  return SESSION_ONLY_ROUTES.some(
    (route) => normalized === route || normalized.startsWith(route + "/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const fullPath = pathname + search;

  // ── Custom storefront domains ──────────────────────────────────────────────
  // A request arriving on a seller's connected domain (anything that isn't a VYA
  // host) is served that store's hosted storefront. Runs before the waitlist/auth
  // gate so the seller's own customers never hit the VYA login wall. Static assets
  // and API calls pass through untouched.
  const rawHost = (request.headers.get("host") || "").toLowerCase();
  const host = rawHost.split(":")[0];
  const localPort = rawHost.split(":")[1] || "";

  // ── PLAN B: stores served from their own registrable domain ────────────────
  // {slug}.vyasites.com (or .vyasites.test locally, via /etc/hosts) serves that seller's captured
  // storefront from an origin the same-origin policy isolates from VYA — which is what lets the
  // seller's OWN JavaScript run, so their carousels, filters, cart drawer and search work natively
  // instead of being imitated by a shim.
  //
  // Runs FIRST: a store origin is not a "connected custom domain", and must never fall through to
  // the marketplace, the OS host or the login gate.
  const planBSlug = storeSlugForHost(host);
  if (planBSlug) {
    // SECURITY. The seller's own code runs on this origin, so VYA's admin, portal and internal APIs
    // must not answer here — that script could otherwise drive them with the visitor's cookies.
    // 404, not 403: a store origin has no business confirming those surfaces exist.
    if (isRefusedOnStoreHost(pathname)) {
      return new NextResponse("Not found", { status: 404 });
    }

    // The theme's cart FORM. Method-aware, and checked before the table below because GET /cart is
    // the cart PAGE (served from the capture) while POST /cart is the Update/Checkout submit — the
    // same path meaning two different things. Left unrouted, that POST reached Next, which took it
    // for a Server Action and answered "Server action not found." to a shopper pressing Checkout.
    const cartSubmit = shopifyCartSubmitRoute(pathname, request.method);
    if (cartSubmit) {
      const url = request.nextUrl.clone();
      url.pathname = cartSubmit;
      return NextResponse.rewrite(url);
    }

    // The theme's own route table, answered in Shopify's dialect. Every Shopify theme publishes
    // these as RELATIVE paths, so on this origin the theme's JavaScript sends its cart calls to us
    // (see app/lib/plan-b/cart-json.ts). One mapping covers every Shopify store.
    // …and Squarespace's, which its one shared storefront bundle calls the same relative way.
    const themeRoute = shopifyThemeRoute(pathname) || squarespaceThemeRoute(pathname);
    if (themeRoute) {
      const url = request.nextUrl.clone();
      url.pathname = themeRoute;
      return NextResponse.rewrite(url);
    }

    // Squarespace's Checkout buttons go through a redirector of its own; send it to VYA's checkout
    // with the shopper's VYA cart. Unrouted it was rewritten into /site/{slug}/commerce/goto-checkout
    // and answered "Page not found" — one click from paying.
    const sqsCheckout = squarespaceCheckoutRedirect(pathname);
    if (sqsCheckout) {
      const url = request.nextUrl.clone();
      const [p, q] = sqsCheckout.split("?");
      url.pathname = p;
      url.search = q ? `?${q}` : "";
      return NextResponse.redirect(url);
    }

    // Shopify also serves every product under a COLLECTION-SCOPED url —
    // /collections/{handle}/products/{product}. Themes use it for real navigation and for their
    // quick-shop fetch, so leaving it unrouted meant clicking "Quick Shop" fetched a 404 and the
    // panel simply never appeared.
    const scoped = pathname.match(/^\/collections\/[^/]+\/products\/([^/]+)\/?$/i);
    if (scoped) {
      const url = request.nextUrl.clone();
      url.pathname = `/site/${planBSlug}/products/${scoped[1]}`;
      return NextResponse.rewrite(url);
    }

    // Shopify's telemetry sink. The theme's inline analytics bootstrap beacons here (a SAME-ORIGIN
    // path, so no allowlist reaches it) on every page view. Unrouted it fell through to Next's HTML
    // 404 — a 107KB error page returned for a fire-and-forget beacon. Ad blockers cancel these
    // before they leave the browser, which is why they showed as ERR_BLOCKED_BY_CLIENT; a shopper
    // WITHOUT a blocker was silently paying for the 404 instead. 204 costs nothing and is what a
    // beacon endpoint is supposed to say.
    if (pathname.startsWith("/.well-known/shopify/monorail")) {
      return new NextResponse(null, { status: 204 });
    }

    // Theme assets. Shopify themes publish their import map with ROOT-RELATIVE `/cdn/…` specifiers,
    // so on this origin they resolve against us — app/cdn/[...path] proxies them from the site we
    // captured. Most such paths carry a file extension and skip middleware entirely (the matcher
    // excludes dotted paths); this covers the extensionless ones, which would otherwise be rewritten
    // into /site/{slug}/cdn/… and 404.
    if (pathname.startsWith("/cdn/")) return NextResponse.next();

    // Checkout is VYA's own flow, not a captured page — the theme's cart links straight to it, and
    // rewriting it into /site/{slug}/ left the shopper on a 404 one click from paying.
    if (isVyaOwnedPath(pathname)) return NextResponse.next();

    // Everything else is a storefront page, served from the captured site.
    // A path that ALREADY points at /site/ is passed through: captures taken for Plan A rewrote
    // their internal links to /site/{slug}/…, and prefixing those again would 404 every link on the
    // page. (New Plan B captures keep links root-relative — see CrawlOpts.linkBase.)
    if (pathname.startsWith("/site/")) return NextResponse.next();
    if (!pathname.startsWith("/_next") && !pathname.startsWith("/api")) {
      const url = request.nextUrl.clone();
      url.pathname = `/site/${planBSlug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  const isVyaHost =
    host === "vyaplatform.com" ||
    host === "www.vyaplatform.com" ||
    host === "localhost" ||
    host.endsWith(".vercel.app");

  // ── getvya.ai — the operating-system product ────────────────────────────────
  // getvya.ai serves the seller OS on its own host: the marketing site at the root
  // and the Owner Workspace at /admin. Runs BEFORE the storefront catch-all below so
  // it isn't mistaken for a seller's connected domain. APIs, /_next, /infra assets and
  // the raw /infrastructure routes pass through to the normal pipeline (which keeps
  // their auth gating + static rewrites); only the OS's own clean paths are rewritten.
  // Local dev convenience: hitting the app on port 3333 (`npm run dev:os`) behaves like the getvya.ai
  // OS host — marketing homepage, /admin workspace, /company, etc. — so the OS surface is previewable
  // locally without editing /etc/hosts. Marketplace stays on the default port (localhost:3000).
  const isOsHost = host === "getvya.ai" || host === "www.getvya.ai" || localPort === "3333";
  if (isOsHost) {
    const passthrough =
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      // Captured/imported storefront pages — the OS editor previews them in a SAME-ORIGIN iframe
      // (/site/{slug}), so this host must serve them via the route handler, not the marketing rewrite.
      pathname.startsWith("/site") ||
      // Block-built storefronts (/s/{handle}) for the same reason: the studio's "View" opens
      // /s/{handle}?preview=1 relative to whatever host you're on, so without this the OS host
      // hands that link to the marketing rewrite and it 404s. Canonical still points at
      // vyaplatform.com (see app/s/[handle]/page.tsx), so serving it here costs no SEO.
      pathname.startsWith("/s/") ||
      // The rest of the buying journey. A storefront served on this host links to /checkout, /cart
      // and /order with root-relative hrefs, so they resolve against whatever host the shopper is
      // on — hand those to the marketing rewrite and Buy now leads to a 404.
      pathname === "/checkout" || pathname.startsWith("/checkout/") ||
      pathname === "/cart" || pathname.startsWith("/cart/") ||
      pathname === "/order" || pathname.startsWith("/order/") ||
      pathname === "/pay" || pathname.startsWith("/pay/") ||
      // Offers are part of that same journey: the accepted-offer page links straight to /checkout.
      pathname === "/offer" || pathname.startsWith("/offer/") ||
      // The consignor portal. A store's consignors sign in by magic link to see
      // their pieces and payouts, and /api/consignor/verify redirects here on
      // success — so without this they authenticate and land on the marketing
      // rewrite, which has no consignor.html and 404s. Stripe's Connect return
      // URL points here too.
      pathname === "/consignor" || pathname.startsWith("/consignor/") ||
      // Printed QR codes point at getvya.ai/q/{code}. It's a route handler that logs the
      // scan and redirects, so it must reach the app rather than the marketing rewrite —
      // otherwise every scanned card lands on /infra/q/{code}.html and 404s.
      pathname.startsWith("/q/") ||
      pathname.startsWith("/infra/") ||
      pathname === "/infrastructure" ||
      pathname.startsWith("/infrastructure/") ||
      // legacy admin auth routes must stay reachable so admin login works on this host
      pathname === "/admin/login" ||
      pathname === "/admin/set-password" ||
      pathname.startsWith("/admin/auth") ||
      // Store owners sign in via magic link here (callbackUrl=/admin → onboarding/workspace).
      // The SUB-paths matter as much as /login itself: Auth.js sends you to
      // /login/check-email after you enter your email and /login/error on failure
      // (app/lib/auth.ts), so matching only the exact path 404s the moment anyone
      // actually tries to sign in.
      pathname === "/login" || pathname.startsWith("/login/") ||
      pathname === "/register" || pathname.startsWith("/register/") ||
      // A STORE signs in and signs up here. /login above is the marketplace shopper's sign-in and
      // /admin/login is the owner's password panel — neither is a seller's front door, which is why
      // a store owner following her own link kept landing somewhere that couldn't let her in.
      // /store/continue is the hop every provider returns to; it asks whoami and forwards her to
      // onboarding or her workspace. Named individually rather than passing all of /store/*: the
      // rest of that tree is the legacy marketplace portal and belongs on vyaplatform.com only.
      pathname === "/store/login" ||
      pathname === "/store/signup" ||
      pathname === "/store/continue" ||
      pathname.startsWith("/ingest");
    if (!passthrough) {
      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        // Owner Workspace. The path→route mapping (/admin/* → /infrastructure/admin/*) is a
        // host-conditional rewrite in next.config (client-router aware, so SPA nav works).
        // The workspace admits the owner (ADMIN_PASSWORD) OR any signed-in store partner (their
        // session). Per-store data scoping happens server-side (resolveStoreSlugAny returns only
        // their store's data); owner-only destructive actions stay behind ADMIN_PASSWORD (isOwner).
        // A signed-in user with no store yet is routed to onboarding by the layout (via whoami).
        // Signed out → the SELLER sign-in, carrying where she was headed so she lands back on it
        // once she's in. This used to send her to /admin/login, the owner's password + TOTP panel,
        // which no store owner has credentials for — and it fired HERE, in the proxy, before any
        // page code could offer her something better. The owner's own panel is unchanged and still
        // reachable directly at /admin/login (it's in the passthrough list above).
        // `next dev` only: the workspace is the owner's without a cookie, matching the same
        // shortcut in /api/infrastructure/whoami. The two used to disagree — whoami handed out an
        // owner identity that this gate then refused — and the sign-in page bounced between them.
        // NODE_ENV is "production" on Vercel prod AND previews, so this cannot reach the live site.
        const devOwner = process.env.NODE_ENV === "development";
        if (!devOwner && !(await isAdminAuthenticated(request)) && !hasUserSession(request)) {
          const loginUrl = new URL("/store/login", request.url);
          loginUrl.searchParams.set("next", fullPath);
          return NextResponse.redirect(loginUrl);
        }
        return NextResponse.next();
      }
      // Everything else on getvya.ai is the marketing site: "/" → landing page,
      // "/company" etc → the matching static page under public/infra.
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/infra/index.html" : `/infra${pathname.replace(/\/+$/, "")}.html`;
      return NextResponse.rewrite(url);
    }
    // passthrough falls through to the normal pipeline; the storefront blocks skip isOsHost.
  }

  // ── Old /infrastructure/* URLs → getvya.ai ──────────────────────────────────
  // The OS moved to its own domain. Permanently redirect the old paths on the
  // marketplace host so links, bookmarks and search results follow:
  //   vyaplatform.com/infrastructure            → getvya.ai/
  //   vyaplatform.com/infrastructure/admin/…    → getvya.ai/admin/…
  //   vyaplatform.com/infrastructure/company    → getvya.ai/company
  // Gated to the real marketplace host so localhost / *.vercel.app previews and
  // getvya.ai itself are unaffected.
  const isMarketplaceHost = host === "vyaplatform.com" || host === "www.vyaplatform.com";
  if (isMarketplaceHost && (pathname === "/infrastructure" || pathname.startsWith("/infrastructure/"))) {
    const rest = pathname.slice("/infrastructure".length); // "" | "/admin/…" | "/company"
    let target: string;
    if (rest === "" || rest === "/") target = "/";
    else if (rest === "/admin" || rest.startsWith("/admin/")) target = `/admin${rest.slice("/admin".length)}`;
    else target = rest;
    return NextResponse.redirect(new URL(`${target}${search}`, "https://getvya.ai"), 308);
  }

  // Free branded subdomain: {handle}.vyaplatform.com → that store's storefront.
  // We rewrite to /s/{handle}, which itself redirects to the captured site if the
  // seller brought one over. (Needs a *.vyaplatform.com wildcard domain on Vercel.)
  const vyaSub = host.endsWith(".vyaplatform.com") && !isVyaHost ? host.slice(0, -".vyaplatform.com".length) : null;
  if (vyaSub && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
    if (pathname.startsWith("/s/") || pathname.startsWith("/site/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/s/${vyaSub}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // Free branded subdomain on the OS brand: {handle}.getvya.ai → that store's storefront. Same as the
  // vyaplatform subdomain above, on getvya.ai. The bare/www OS host is handled by isOsHost above, so a
  // subdomain here is always a store handle. (Needs a *.getvya.ai wildcard domain on Vercel.)
  const osSub = host.endsWith(".getvya.ai") ? host.slice(0, -".getvya.ai".length) : null;
  if (osSub && osSub !== "www" && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
    if (pathname.startsWith("/s/") || pathname.startsWith("/site/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/s/${osSub}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  if (host && !isVyaHost && !isOsHost && !pathname.startsWith("/api") && !pathname.startsWith("/_next")) {
    // A captured site's internal links are /site/{slug}/… — let those through so
    // navigation within a brought-over site works on the seller's own domain.
    if (pathname.startsWith("/site/")) return NextResponse.next();
    const url = request.nextUrl.clone();
    // If this domain's store brought its own site over, serve the captured site;
    // otherwise fall back to the block/template storefront.
    const capturedSlug = await capturedSlugForDomain(host).catch(() => null);
    url.pathname = capturedSlug ? `/site/${capturedSlug}${pathname === "/" ? "" : pathname}` : "/s/by-domain";
    return NextResponse.rewrite(url);
  }

  // Per-recipient email attribution: a `?u=` token (from an email link) identifies the
  // subscriber who clicked. Persist it as a 30-day cookie so the eventual click-through
  // (/api/track) can record the click against them — even logged out, even before any
  // VYA session. verifyRecipientToken is cheap and rejects forged tokens. We only set
  // the cookie; downstream routing is unchanged.
  const uToken = request.nextUrl.searchParams.get("u");
  let eidValid = false;
  if (uToken) {
    try {
      eidValid = !!(await verifyRecipientTokenEdge(uToken));
    } catch {
      eidValid = false;
    }
  }
  const attachEid = (res: NextResponse): NextResponse => {
    if (eidValid && uToken) {
      res.cookies.set("via_eid", uToken, { maxAge: 60 * 60 * 24 * 30, path: "/", httpOnly: true, sameSite: "lax" });
    }
    return res;
  };

  // Redirect /waitlist to /login
  if (pathname === "/waitlist" || pathname.startsWith("/waitlist/")) {
    return attachEid(NextResponse.redirect(new URL("/login", request.url)));
  }

  // Waitlist guard: a logged-out visitor may view ONE product (the shared link
  // they arrived on), but can't browse into others. We remember the first product
  // they open in a 24h cookie; any different product sends them to login. OG/Twitter
  // preview images stay public so shared links still unfurl, and cookieless crawlers
  // are unaffected so products stay indexable.
  if (
    pathname.startsWith("/products/") &&
    !pathname.endsWith("/opengraph-image") &&
    !pathname.endsWith("/twitter-image") &&
    !hasUserSession(request) &&
    !hasAccessCode(request) &&
    !(await isAdminAuthenticated(request))
  ) {
    const seen = request.cookies.get("via_pv")?.value;
    if (seen && seen !== pathname) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", fullPath);
      return attachEid(NextResponse.redirect(loginUrl));
    }
    const res = attachEid(NextResponse.next());
    if (!seen) {
      res.cookies.set("via_pv", pathname, { maxAge: 60 * 60 * 24, path: "/", sameSite: "lax" });
    }
    return res;
  }

  // The owner workspace at /infrastructure/admin is admin-only — gate it behind the VYA admin
  // login (the admin_users list). Must run BEFORE the public-route check, because /infrastructure
  // (the public landing page) is a public route and would otherwise let /infrastructure/admin/*
  // through too.
  if (pathname === "/infrastructure/admin" || pathname.startsWith("/infrastructure/admin/")) {
    // Owner (ADMIN_PASSWORD) OR a signed-in store partner. Data is scoped per-request
    // server-side (resolveStoreSlugAny); owner-only actions stay behind ADMIN_PASSWORD.
    if (!(await isAdminAuthenticated(request)) && !hasUserSession(request)) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", fullPath);
      return attachEid(NextResponse.redirect(loginUrl));
    }
    return attachEid(NextResponse.next());
  }

  // Serve the static marketing site (public/infra) at /infrastructure/* — the admin workspace is
  // handled above, so this only covers the public pages. URLs are extensionless
  // (/infrastructure/company → /infra/company.html); static assets are referenced absolutely at
  // /infra/* and bypass the proxy entirely (the matcher excludes dotted paths).
  if (pathname === "/infrastructure" || pathname.startsWith("/infrastructure/")) {
    const rest = pathname.slice("/infrastructure".length).replace(/\/$/, "");
    const url = request.nextUrl.clone();
    url.pathname = rest === "" ? "/infra/index.html" : `/infra${rest}.html`;
    return NextResponse.rewrite(url);
  }

  // Allow public routes unconditionally
  if (isPublicRoute(pathname)) {
    return attachEid(NextResponse.next());
  }

  // Admin routes (browser UI + API)
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!(await isAdminAuthenticated(request))) {
      // API admin routes return 401; browser admin routes redirect to login
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (pathname === "/admin" || pathname === "/admin/") {
      return NextResponse.redirect(new URL("/admin/sync", request.url));
    }
    return NextResponse.next();
  }

  // Session-only routes (account, favorites, etc.) — need session but not via_access
  if (isSessionOnlyRoute(pathname)) {
    if (!hasUserSession(request)) {
      if (pathname.startsWith("/store/")) {
        return NextResponse.redirect(new URL("/store/login", request.url));
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", fullPath);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  const adminAuthed = await isAdminAuthenticated(request);

  // All other routes: require session + pilot approval (via_access cookie)
  if (!hasUserSession(request) && !adminAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", fullPath);
    return attachEid(NextResponse.redirect(loginUrl));
  }

  // Has session but no approval cookie → run pilot check
  if (hasUserSession(request) && !hasAccessCode(request) && !adminAuthed) {
    const checkUrl = new URL("/api/pilot-check", request.url);
    checkUrl.searchParams.set("next", fullPath);
    return NextResponse.redirect(checkUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
    // The default pattern above skips any path containing a dot, which would exclude the very
    // endpoints a Shopify theme calls. List them explicitly so Plan B's cart works.
    "/cart.js",
    "/cart.json",
    "/cart/add.js",
    "/cart/change.js",
    "/cart/update.js",
    "/search/suggest.json",
    // Shopify's analytics beacon — dotted path, so the default pattern above skips it.
    "/.well-known/shopify/monorail/:path*",
  ],
};
