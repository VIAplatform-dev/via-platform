import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubToken } from "@/app/lib/buyer-auth";
import { setEmailSubscribed } from "@/app/lib/store-customers-db";
import { stores } from "@/app/lib/stores";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
const storeName = (slug: string) => stores.find((s) => s.slug === slug)?.name || slug;

// One-click unsubscribe (RFC 8058) — Gmail/Yahoo POST here from the List-Unsubscribe header.
// Store-scoped: only flips this store's marketing consent for this email.
export async function POST(request: NextRequest) {
 const v = verifyUnsubToken(request.nextUrl.searchParams.get("t"));
 if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
 await setEmailSubscribed(v.storeSlug, v.email, false);
 return NextResponse.json({ ok: true });
}

// The human clicks the footer link → unsubscribe + a simple confirmation page.
export async function GET(request: NextRequest) {
 const v = verifyUnsubToken(request.nextUrl.searchParams.get("t"));
 if (v) await setEmailSubscribed(v.storeSlug, v.email, false);
 const name = v ? esc(storeName(v.storeSlug)) : "this store";
 const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Unsubscribed</title></head>
 <body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#faf8f4;color:#241f1a;display:flex;min-height:100vh;align-items:center;justify-content:center;">
 <div style="max-width:440px;text-align:center;padding:32px;">
 ${v
 ? `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:25px;margin:0 0 10px;">You're unsubscribed.</h1>
 <p style="color:#6b6259;font-size:14px;line-height:1.65;margin:0;">You won't receive marketing emails from <b>${name}</b> anymore. Order and shipping updates for anything you buy will still reach you.</p>`
 : `<h1 style="font-family:Georgia,serif;font-weight:400;font-size:25px;margin:0 0 10px;">Link not valid</h1>
 <p style="color:#6b6259;font-size:14px;line-height:1.65;margin:0;">This unsubscribe link couldn't be verified.</p>`}
 </div></body></html>`;
 return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
