import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// Simple hash function - must match middleware
function hashPassword(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const expectedPassword = process.env.ADMIN_PASSWORD;

    // If no password is configured, deny access
    if (!expectedPassword) {
      return NextResponse.json(
        { error: "Admin access not configured" },
        { status: 500 }
      );
    }

    // Check password
    if (password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Set auth cookie (expires in 7 days)
    const cookieStore = await cookies();
    cookieStore.set("via_admin_token", hashPassword(expectedPassword), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}

// Logout endpoint
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("via_admin_token");
  return NextResponse.json({ success: true });
}
