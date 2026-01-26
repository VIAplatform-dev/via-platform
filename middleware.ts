import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes under /admin that should remain public
const PUBLIC_ADMIN_ROUTES = ["/admin/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip if this is a public admin route
  const isPublicRoute = PUBLIC_ADMIN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Check for admin auth cookie
  const adminToken = request.cookies.get("via_admin_token")?.value;
  const expectedToken = process.env.ADMIN_PASSWORD;

  // If no password is configured, always require login (show error on login page)
  if (!expectedToken) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    loginUrl.searchParams.set("error", "not_configured");
    return NextResponse.redirect(loginUrl);
  }

  // Verify the token matches the hashed password
  if (adminToken && adminToken === hashPassword(expectedToken)) {
    return NextResponse.next();
  }

  // Redirect to login page
  const loginUrl = new URL("/admin/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

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

export const config = {
  matcher: ["/admin/:path*"],
};
