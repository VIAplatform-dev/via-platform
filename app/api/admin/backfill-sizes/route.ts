import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { backfillSizeKeys } from "@/app/lib/size-keys-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function hashPassword(password: string): string {
 return crypto.createHash("sha256").update(password).digest("hex");
}
function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === hashPassword(adminPassword);
}

// POST /api/admin/backfill-sizes. Recompute size_keys (filtering) AND repair the
// stored `size` when it's a generic letter that should be a real size (e.g. shoes
// mislabeled "M"). Safe to re-run; only touches generic/null sizes.
// Returns { scanned, updated, groups, sizesFixed }.
export async function POST(request: NextRequest) {
 if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const result = await backfillSizeKeys();
 return NextResponse.json({ ok: true, ...result });
}
