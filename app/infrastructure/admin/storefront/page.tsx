"use client";

// The storefront editor. Which one depends on how the seller set their store up:
//  • Brought their own site over (captured) → the CLASSIC editor's captured mode: a live, pixel-for-pixel
//    iframe of their exact site (their real header/footer), backlinked to VYA with our cart/checkout.
//  • Built from scratch (blocks) → the chat-first Canva-style STUDIO.
// We check capture status once, then render the matching editor. Its back arrow returns to /admin.
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import WelcomeCoach from "@/app/store/storefront/WelcomeCoach";

const Studio = dynamic(() => import("@/app/store/storefront/studio/page"), { ssr: false });
const ClassicEditor = dynamic(() => import("@/app/store/storefront/page"), { ssr: false });

export default function StorefrontEditorRoute() {
 const [mode, setMode] = useState<"loading" | "captured" | "blocks">("loading");
 const [welcome, setWelcome] = useState<"import" | "build" | null>(null);
 const [storeName, setStoreName] = useState("Your store");

 useEffect(() => {
  // First-run coach from onboarding (?welcome=import|build) — show once, then strip the flag.
  const w = new URLSearchParams(window.location.search).get("welcome");
  if (w === "import" || w === "build") { setWelcome(w); window.history.replaceState(null, "", window.location.pathname); }
  fetch("/api/store/capture")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => setMode(d && d.captured > 0 ? "captured" : "blocks"))
   .catch(() => setMode("blocks"));
  fetch("/api/store/storefront")
   .then((r) => (r.ok ? r.json() : null))
   .then((d) => { if (d?.store?.name) setStoreName(d.store.name as string); })
   .catch(() => {});
 }, []);

 return (
  <>
   {mode === "loading"
    ? <div className="grid h-screen w-full place-items-center bg-[#fbf9f5] text-[13px] text-stone-400">Loading your storefront…</div>
    : mode === "captured" ? <ClassicEditor /> : <Studio />}
   {welcome && <WelcomeCoach mode={welcome} storeName={storeName} onClose={() => setWelcome(null)} />}
  </>
 );
}
