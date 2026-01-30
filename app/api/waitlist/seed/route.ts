import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import fs from "fs";
import path from "path";

export async function POST() {
  try {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      return NextResponse.json(
        { error: "DATABASE_URL not set" },
        { status: 500 }
      );
    }

    const sql = neon(url);

    // Create table
    await sql`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        signup_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        source VARCHAR(50) DEFAULT 'waitlist'
      )
    `;

    // Read existing JSON data
    const dataFile = path.join(process.cwd(), "app", "data", "waitlist.json");
    const content = fs.readFileSync(dataFile, "utf-8");
    const data = JSON.parse(content);

    let inserted = 0;
    let skipped = 0;

    for (const entry of data.emails) {
      try {
        await sql`
          INSERT INTO waitlist (email, signup_date, source)
          VALUES (${entry.email}, ${entry.signupDate}, ${entry.source || "waitlist"})
          ON CONFLICT (email) DO NOTHING
        `;
        inserted++;
      } catch {
        skipped++;
      }
    }

    return NextResponse.json({
      message: `Seeded ${inserted} emails (${skipped} skipped)`,
      total: data.emails.length,
    });
  } catch (error) {
    console.error("[Waitlist Seed] Error:", error);
    return NextResponse.json(
      { error: "Seed failed", details: String(error) },
      { status: 500 }
    );
  }
}
