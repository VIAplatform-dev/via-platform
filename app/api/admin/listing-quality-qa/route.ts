import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getListingQualityQA } from "@/app/lib/listing-quality-db";

// Read-only QA: every currently-flagged listing with a description excerpt + the
// inferred category + which checks failed, so false flags can be spotted and the
// detection tuned. Optional ?store=<slug> and ?issue=size/measurements|description|image.
//   /api/admin/listing-quality-qa?issue=size/measurements

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 const store = request.nextUrl.searchParams.get("store") || undefined;
 const issue = request.nextUrl.searchParams.get("issue"); // optional filter

 let rows = await getListingQualityQA(store);
 if (issue) rows = rows.filter((r) => r.issues.includes(issue));

 return NextResponse.json({
 total: rows.length,
 byIssue: {
 "size/measurements": rows.filter((r) => r.issues.includes("size/measurements")).length,
 description: rows.filter((r) => r.issues.includes("description")).length,
 image: rows.filter((r) => r.issues.includes("image")).length,
 },
 rows,
 });
}
