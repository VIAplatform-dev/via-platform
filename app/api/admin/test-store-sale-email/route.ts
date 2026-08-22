import { NextRequest, NextResponse } from "next/server";
import { sendStoreSaleEmail } from "@/app/lib/email";
import crypto from "crypto";

function isAuthorized(request: NextRequest): boolean {
 const adminPassword = process.env.ADMIN_PASSWORD;
 if (!adminPassword) return false;
 const authHeader = request.headers.get("authorization");
 if (authHeader === `Bearer ${adminPassword}`) return true;
 const token = request.cookies.get("via_admin_token")?.value;
 return !!token && token === crypto.createHash("sha256").update(adminPassword).digest("hex");
}

export async function GET(request: NextRequest) {
 if (!isAuthorized(request)) {
 return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 }

 await sendStoreSaleEmail({
 storeEmail: "hana@vyaplatform.com",
 storeName: "Test Store",
 storeSlug: "test-store",
 orderTotal: 485,
 currency: "USD",
 productName: "Vintage Chanel Classic Flap Bag",
 orderId: "TEST-001",
 timestamp: new Date().toISOString(),
 });

 return NextResponse.json({ ok: true, sent: "hana@vyaplatform.com" });
}
