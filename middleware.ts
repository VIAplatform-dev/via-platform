import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyRecipientTokenEdge } from "@/app/lib/recipientToken-edge";
import { capturedSlugForDomain } from "@/app/lib/domain-routing-edge";

// Routes accessible without any authentication or approval
const PUBLIC_ROUTES = [
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
  "/api/admin/set-password",
  "/terms",
  "/privacy",
  "/api/giveaway",
  "/api/cron",
  "/api/test-emails",
  "/for-stores",
  "/partner-with-vya",
  "/infrastructure",
  "/s",
  "/site",
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
  "/api/store/intake",
  "/api/store/items",
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
  "/api/checkout",
  "/api/storefront",
  "/checkout",
  "/api/thread",
  "/thread",
  "/store/login",
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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const fullPath = pathname + search;

  // ── Custom storefront domains ──────────────────────────────────────────────
  // A request arriving on a seller's connected domain (anything that isn't a VYA
  // host) is served that store's hosted storefront. Runs before the waitlist/auth
  // gate so the seller's own customers never hit the VYA login wall. Static assets
  // and API calls pass through untouched.
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
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
  const isOsHost = host === "getvya.ai" || host === "www.getvya.ai";
  if (isOsHost) {
    const passthrough =
      pathname.startsWith("/api") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/infra/") ||
      pathname === "/infrastructure" ||
      pathname.startsWith("/infrastructure/") ||
      // legacy admin auth routes must stay reachable so admin login works on this host
      pathname === "/admin/login" ||
      pathname === "/admin/set-password" ||
      pathname.startsWith("/admin/auth");
    if (!passthrough) {
      if (pathname === "/admin" || pathname.startsWith("/admin/")) {
        // Owner Workspace. The path→route mapping (/admin/* → /infrastructure/admin/*) is a
        // host-conditional rewrite in next.config (client-router aware, so SPA nav works).
        // Middleware only enforces the admin gate here (auth pages are in `passthrough` above),
        // then hands off — the rewrite serves the actual route.
        if (!(await isAdminAuthenticated(request))) {
          const loginUrl = new URL("/admin/login", request.url);
          loginUrl.searchParams.set("redirect", fullPath);
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
    if (!(await isAdminAuthenticated(request))) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("redirect", fullPath);
      return attachEid(NextResponse.redirect(loginUrl));
    }
    return attachEid(NextResponse.next());
  }

  // Serve the static marketing site (public/infra) at /infrastructure/* — the admin workspace is
  // handled above, so this only covers the public pages. URLs are extensionless
  // (/infrastructure/company → /infra/company.html); static assets are referenced absolutely at
  // /infra/* and bypass middleware entirely (the matcher excludes dotted paths).
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)" ],
};
