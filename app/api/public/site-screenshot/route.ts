import { NextRequest, NextResponse } from "next/server";

// Public (landing-page "rebuild your store" demo): return a real screenshot of a store's homepage as
// a PNG for the marketing preview. Unlike the sandboxed clone iframe (which can't render JS-only
// themes like Squarespace without an unsafe same-origin grant), this captures the page in a real
// browser — so SPA themes come through cleanly. First-party on purpose: the frontend stays
// same-origin and we can swap the underlying provider here without touching the page.
export const maxDuration = 25;

function normalizeUrl(raw: string): string | null {
 let u = raw.trim();
 if (!u) return null;
 if (!/^https?:\/\//i.test(u)) u = "https://" + u;
 try {
  const p = new URL(u);
  if (!/\./.test(p.hostname)) return null; // must be a real domain, not "localhost"/a bare word
  if (/^(localhost$|127\.|10\.|192\.168\.|0\.0\.0\.0$)/i.test(p.hostname)) return null; // no internal targets
  return p.origin + (p.pathname === "/" ? "" : p.pathname);
 } catch {
  return null;
 }
}

export async function GET(request: NextRequest) {
 const target = normalizeUrl(new URL(request.url).searchParams.get("url") || "");
 if (!target) return NextResponse.json({ error: "Enter a valid store URL." }, { status: 400 });

 // Render in a real browser (wait/4 = give JS-drawn themes ~4s to finish painting) and capture the
 // FULL page (fullpage) so the demo can scroll the whole homepage, not just the hero. The target URL
 // is appended RAW (the provider parses its own options path, not a query param); wait must be an
 // integer and only valid options may appear or it 404s.
 const shotUrl = `https://image.thum.io/get/width/1400/wait/4/fullpage/${target}`;
 try {
  const res = await fetch(shotUrl, { signal: AbortSignal.timeout(22000) });
  if (!res.ok) return NextResponse.json({ error: "Couldn’t render a preview for that site." }, { status: 502 });
  const buf = await res.arrayBuffer();
  // A too-small body is the provider's error/placeholder, not a real screenshot — treat as a failure
  // so the demo shows its graceful fallback instead of a broken/blank image.
  if (buf.byteLength < 1024) return NextResponse.json({ error: "Preview not available for this site." }, { status: 502 });
  return new NextResponse(buf, {
   headers: {
    "content-type": res.headers.get("content-type") || "image/png",
    // Cache hard at the CDN so repeat demo loads are instant and cheap.
    "cache-control": "public, max-age=3600, s-maxage=86400",
   },
  });
 } catch {
  return NextResponse.json({ error: "Preview timed out for that site." }, { status: 504 });
 }
}
