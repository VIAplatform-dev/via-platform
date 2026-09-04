import { NextRequest, NextResponse } from "next/server";
import { actingSeller } from "@/app/lib/market/auth";
import { getCart, saveCartLines, closeCart, type StoredCartLine } from "@/app/lib/market/carts-db";

export const dynamic = "force-dynamic";

// GET — one cart, so a second device can pick up exactly where the first left off.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await ctx.params;
 const cart = await getCart(acting.seller.id, id);
 if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ cart });
}

// PATCH — replace this cart's lines. The client owns the whole list; last write wins.
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await ctx.params;
 const body = await request.json().catch(() => ({}));
 const lines = Array.isArray(body?.lines) ? (body.lines as StoredCartLine[]) : null;
 if (!lines) return NextResponse.json({ error: "lines required" }, { status: 400 });
 const cart = await saveCartLines(acting.seller.id, id, lines);
 if (!cart) return NextResponse.json({ error: "Not found" }, { status: 404 });
 return NextResponse.json({ cart });
}

// DELETE — the seller cleared this cart; keep the row for the record, just stop showing it.
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const acting = await actingSeller(request);
 if (!acting) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 const { id } = await ctx.params;
 const status = request.nextUrl.searchParams.get("status") === "paid" ? "paid" : "dropped";
 await closeCart(acting.seller.id, id, status);
 return NextResponse.json({ ok: true });
}
