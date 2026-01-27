import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Protected admin routes that require authentication
const PROTECTED_ROUTES = [
  "/admin/sync",
  "/admin/analytics",
  "/admin/emails",
  "/admin/squarespace-setup",
];

// Default admin page to redirect to
const DEFAULT_ADMIN_PAGE = "/admin/sync";

// Simple hash function for password comparison
function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function isAuthenticated(request: NextRequest): boolean {
  const adminToken = request.cookies.get("via_admin_token")?.value;
  const expectedToken = process.env.ADMIN_PASSWORD;

  // No password configured = not authenticated
  if (!expectedToken) {
    return false;
  }

  // No token or token mismatch = not authenticated
  if (!adminToken || adminToken !== hashPassword(expectedToken)) {
    return false;
  }

  return true;
}

function isProtectedRoute(pathname: string): boolean {
  // Normalize pathname (remove trailing slash)
  const normalizedPath = pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;

  // Check if this is the base /admin route
  if (normalizedPath === "/admin") {
    return true;
  }

  // Check if this matches any protected route
  return PROTECTED_ROUTES.some(
    (route) => normalizedPath === route || normalizedPath.startsWith(route + "/")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip login page - always accessible
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return NextResponse.next();
  }

  // Check if this route needs protection
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  // Check authentication
  if (!isAuthenticated(request)) {
    const loginUrl = new URL("/admin/login", request.url);

    // Set redirect URL - use the page they were trying to access
    const redirectTo = pathname === "/admin" ? DEFAULT_ADMIN_PAGE : pathname;
    loginUrl.searchParams.set("redirect", redirectTo);

    // Add error param if password not configured
    if (!process.env.ADMIN_PASSWORD) {
      loginUrl.searchParams.set("error", "not_configured");
    }

    return NextResponse.redirect(loginUrl);
  }

  // Redirect /admin to the default admin page
  if (pathname === "/admin" || pathname === "/admin/") {
    return NextResponse.redirect(new URL(DEFAULT_ADMIN_PAGE, request.url));
  }

  // Authenticated and on a valid protected route
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/",
    "/admin/sync",
    "/admin/sync/:path*",
    "/admin/analytics",
    "/admin/analytics/:path*",
    "/admin/emails",
    "/admin/emails/:path*",
    "/admin/squarespace-setup",
    "/admin/squarespace-setup/:path*",
    "/admin/login",
    "/admin/login/:path*",
  ],
};
