import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL or POSTGRES_URL environment variable is not set."
    );
  }
  return url;
}

async function ensureTable() {
  const sql = neon(getDatabaseUrl());
  await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      signup_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      source VARCHAR(50) DEFAULT 'waitlist'
    )
  `;
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, source } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    await ensureTable();
    const sql = neon(getDatabaseUrl());

    // Check for duplicate
    const existing = await sql`
      SELECT email FROM waitlist WHERE email = ${normalizedEmail}
    `;

    if (existing.length > 0) {
      return NextResponse.json(
        { message: "You're already on the waitlist!" },
        { status: 200 }
      );
    }

    await sql`
      INSERT INTO waitlist (email, signup_date, source)
      VALUES (${normalizedEmail}, NOW(), ${source || "waitlist"})
    `;

    console.log(`[Waitlist] New signup: ${normalizedEmail}`);

    return NextResponse.json(
      { message: "You're on the list! We'll be in touch soon." },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Waitlist] Error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await ensureTable();
    const sql = neon(getDatabaseUrl());

    const rows = await sql`
      SELECT email, signup_date, source FROM waitlist ORDER BY signup_date ASC
    `;

    const emails = rows.map((row) => ({
      email: row.email,
      signupDate: row.signup_date,
      source: row.source,
    }));

    return NextResponse.json({
      count: emails.length,
      emails,
    });
  } catch (error) {
    console.error("[Waitlist] Error fetching emails:", error);
    return NextResponse.json(
      { error: "Failed to fetch emails" },
      { status: 500 }
    );
  }
}
