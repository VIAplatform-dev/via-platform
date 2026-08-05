import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Read a bundled asset. `new URL(rel, import.meta.url)` is statically analyzable, so
// Next's file tracing ships these files with the function; readFileSync avoids the
// file:-protocol fetch that undici doesn't implement.
const asset = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)));

// Shared Open Graph / link-preview card for the marketplace. Recreates the homepage
// hero — deep-red croc leather, the cream headline, and the two CTAs — so a shared
// link looks like the site, not a bare logo. Rendered by the root and /login
// `opengraph-image` routes (the share link resolves to /login while the pilot is gated).
export const OG_SIZE = { width: 1200, height: 630 };

export async function renderOgHero() {
 // Static weight — Satori crashes on variable fonts.
 const hanken = asset("../../public/fonts/hanken-grotesk-500.woff");
 const dreame = asset("../../public/fonts/dream-avenue.ttf");
 const crocSrc = `data:image/jpeg;base64,${asset("../../public/hero-v10.jpg").toString("base64")}`;

 return new ImageResponse(
  (
   <div style={{ position: "relative", width: "1200px", height: "630px", display: "flex", backgroundColor: "#D8C8BC" }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={crocSrc} width={1200} height={630} style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", objectFit: "cover" }} alt="" />
    {/* darkening scrim so the cream type reads — Satori needs backgroundImage for gradients */}
    <div style={{ position: "absolute", top: 0, left: 0, width: "1200px", height: "630px", backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 34%, rgba(0,0,0,0.05) 62%, rgba(0,0,0,0) 100%)" }} />
    {/* wordmark, top-left */}
    <div style={{ position: "absolute", top: "46px", left: "60px", display: "flex", alignItems: "flex-end", gap: "14px" }}>
     <div style={{ fontFamily: "Dreame Avenue", fontSize: "48px", color: "#FFFDF8", letterSpacing: "2px", lineHeight: 1 }}>VYA</div>
     <div style={{ display: "flex", fontSize: "13px", color: "rgba(255,253,248,0.8)", textTransform: "uppercase", letterSpacing: "2px", border: "1px solid rgba(255,253,248,0.5)", borderRadius: "5px", padding: "3px 9px" }}>pilot</div>
    </div>
    {/* headline — absolutely placed so it can't collide with the CTAs below */}
    <div style={{ position: "absolute", left: "60px", bottom: "172px", width: "780px", display: "flex", fontFamily: "Hanken Grotesk", fontWeight: 500, fontSize: "62px", lineHeight: 1.08, letterSpacing: "-1px", color: "#FFFDF8" }}>Discover your new favorite pieces.</div>
    {/* CTAs */}
    <div style={{ position: "absolute", left: "60px", bottom: "78px", display: "flex", gap: "16px" }}>
     <div style={{ display: "flex", fontFamily: "Hanken Grotesk", fontWeight: 500, fontSize: "17px", textTransform: "uppercase", letterSpacing: "1.6px", padding: "16px 36px", borderRadius: "10px", backgroundColor: "#FFFDF8", color: "#5D0F17" }}>Explore Stores</div>
     <div style={{ display: "flex", fontFamily: "Hanken Grotesk", fontWeight: 500, fontSize: "17px", textTransform: "uppercase", letterSpacing: "1.6px", padding: "16px 36px", borderRadius: "10px", border: "1px solid #FFFDF8", color: "#FFFDF8" }}>Shop Now</div>
    </div>
   </div>
  ),
  {
   ...OG_SIZE,
   fonts: [
    { name: "Hanken Grotesk", data: hanken, weight: 500 as const, style: "normal" as const },
    { name: "Dreame Avenue", data: dreame, weight: 400 as const, style: "normal" as const },
   ],
  },
 );
}
