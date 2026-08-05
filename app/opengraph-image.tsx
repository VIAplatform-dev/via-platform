import { renderOgHero, OG_SIZE } from "@/app/lib/og-hero";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "VYA — discover your new favorite pieces";

export default function Image() {
 return renderOgHero();
}
