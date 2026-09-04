import Image from "next/image";
import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { recordQrScan, scanLocationFromHeaders } from "@/app/lib/qr-scans-db";
import { isLikelyBotScan } from "@/app/lib/qr-codes";
import EditorsPicksSection from "./EditorsPicksSection";
import NewArrivalsSection from "./NewArrivalsSection";
import StoreCarousel from "./StoreCarousel";
import FlyerGate from "./FlyerGate";
import type { Flyer } from "@/app/lib/flyers";

// What a scanned flyer lands on: the real homepage, with the flyer's own line, and the gate on top.
//
// THE GLIMPSE IS THE REAL THING. These sections read the database on the server rather than
// calling /api/public, which answers 403 to anyone unapproved — so a total stranger sees genuine
// pieces at genuine prices. That is also why there is no separate "preview" version to keep in
// step with the real site: there is only the real site.
//
// The gate disappears the moment they are approved, because `via_access` is then set and this
// component simply stops rendering it. Nothing navigates; the page they wanted becomes theirs.

export default async function FlyerLanding({ flyer }: { flyer: Flyer }) {
 const jar = await cookies();
 const alreadyIn = jar.get("via_access")?.value === "1";

 // Record the scan into the same qr_scans table /q/{code} writes to, so these flyers get the
 // city-level reporting the printed business cards already have. The QR encodes the pretty
 // address rather than a /q redirect, so this page is the only place it can be counted.
 //
 // ONLY when they do not already hold the access cookie: that is the arriving stranger. The
 // refresh straight after signing up carries the cookie, so a single scan cannot count twice.
 if (!alreadyIn) {
  const h = await headers();
  const ua = h.get("user-agent");
  if (!isLikelyBotScan(ua)) {
   // Awaited, not fire-and-forget — the serverless instance can freeze once the response is
   // returned, which would drop the write.
   try {
    await recordQrScan({
     code: `flyer:${flyer.slug}`,
     location: scanLocationFromHeaders(h),
     userAgent: ua,
     referrerHost: null, // a printed scan has no referrer
    });
   } catch {
    // A scan must never cost someone the page. Losing the row beats losing the visit.
   }
  }
 }

 return (
  <main className="w-full">
   <section className="relative overflow-hidden h-[85vh] md:h-screen">
    <Image src="/hero-v10.jpg" alt="" fill priority className="object-cover" sizes="100vw" />
    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0) 75%)" }} />
    <div className="absolute inset-x-0 top-0 h-44" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)" }} />
    <div className="absolute bottom-[22%] left-6 right-6 md:left-10 md:right-auto md:max-w-2xl z-10">
     {/* The flyer's line, verbatim. Someone who just read it on paper should read it again here. */}
     <h1 className="font-serif text-4xl md:text-6xl leading-[1.05] text-[#FFFDF8]">{flyer.headline}</h1>
     <p className="mt-4 max-w-md text-sm md:text-base leading-relaxed text-[#FFFDF8]/85">{flyer.subhead}</p>
    </div>
   </section>

   <Suspense fallback={<div className="bg-[#FFFDF8] py-16 sm:py-24 h-64" />}>
    <EditorsPicksSection />
   </Suspense>

   <section className="bg-[#FFFDF8] py-12 sm:py-16">
    <StoreCarousel />
   </section>

   <Suspense fallback={<div className="bg-[#FFFDF8] py-16 sm:py-24 h-64" />}>
    <NewArrivalsSection />
   </Suspense>

   {alreadyIn ? null : <FlyerGate slug={flyer.slug} headline={flyer.headline} subhead={flyer.subhead} />}
  </main>
 );
}
