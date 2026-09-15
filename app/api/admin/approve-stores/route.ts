import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { storeContactEmails } from "@/app/lib/stores";

function hashPassword(password: string): string {
 const crypto = require("crypto");
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const adminToken = request.cookies.get("via_admin_token")?.value;
 if (adminToken && adminToken === hashPassword(adminPassword)) return true;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 return false;
}

/** POST /api/admin/approve-stores. Approves all store owner emails in pilot_access */
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
 if (!dbUrl) return NextResponse.json({ error: "No database URL" }, { status: 500 });

 const sql = neon(dbUrl);

 const emails = Object.values(storeContactEmails).filter(Boolean) as string[];
 const approved: string[] = [];
 const skipped: string[] = [];

 for (const email of emails) {
 const normalized = email.toLowerCase().trim();
 await sql`
 INSERT INTO pilot_access (email, status, approved_at)
 VALUES (${normalized}, 'approved', NOW())
 ON CONFLICT (email) DO UPDATE SET status = 'approved', approved_at = NOW()
 `;
 approved.push(normalized);
 }

 // Report which stores have no email
 const missing = Object.entries(storeContactEmails)
 .filter(([, email]) => !email)
 .map(([slug]) => slug);

 return NextResponse.json({ approved: approved.length, emails: approved, missing, skipped });
}
