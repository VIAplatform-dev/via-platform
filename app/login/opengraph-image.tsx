import { renderOgHero, OG_SIZE } from "@/app/lib/og-hero";

// The pilot gates the root, so shared links resolve here — this is the card people see.
export const runtime = "nodejs";
// Render on demand (Vercel/CDN caches it) — avoids a build-time file: fetch that undici
// can't do during static prerender.
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "VYA — discover your new favorite pieces";

export default function Image() {
 return renderOgHero();
}
