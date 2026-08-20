"use client";

// A live drop countdown (Days · Hrs · Min · Sec) ticking to a target time. Renders placeholders until
// mounted so the server HTML matches the first client paint (no hydration mismatch), then ticks each second.
import { useEffect, useState } from "react";

export default function Countdown({ target, accent, headingFontFamily, paused }: { target: string; accent: string; headingFontFamily?: string; paused?: boolean }) {
 const [now, setNow] = useState<number | null>(null);
 useEffect(() => {
 const raf = requestAnimationFrame(() => setNow(Date.now())); // first paint (async, not a sync setState in the effect body)
 // In the editor we DON'T tick every second — the constant re-render fights the section drag-reorder,
 // and a preview doesn't need a live clock. The live storefront ticks.
 const id = paused ? null : setInterval(() => setNow(Date.now()), 1000);
 return () => { cancelAnimationFrame(raf); if (id) clearInterval(id); };
 }, [paused]);

 const t = Date.parse(target);
 const diff = now == null || Number.isNaN(t) ? null : Math.max(0, t - now);
 const live = diff === 0;
 const parts = diff == null ? null : {
 d: Math.floor(diff / 86_400_000),
 h: Math.floor(diff / 3_600_000) % 24,
 m: Math.floor(diff / 60_000) % 60,
 s: Math.floor(diff / 1_000) % 60,
 };

 if (live) return <p className="text-2xl @xl:text-3xl" style={{ color: accent, fontFamily: headingFontFamily }}>The drop is live — shop now →</p>;

 const cell = (v: number | null, label: string) => (
 <div className="flex flex-col items-center">
 <span className="text-4xl leading-none @xl:text-6xl" style={{ fontVariantNumeric: "tabular-nums", fontFamily: headingFontFamily }}>{v == null ? "––" : String(v).padStart(2, "0")}</span>
 <span className="mt-2 text-[10px] uppercase tracking-[0.22em] opacity-55">{label}</span>
 </div>
 );
 const sep = <span className="self-start text-3xl leading-none opacity-25 @xl:text-5xl">:</span>;
 return (
 <div className="flex items-start justify-center gap-4 @xl:gap-8">
 {cell(parts?.d ?? null, "Days")}{sep}{cell(parts?.h ?? null, "Hrs")}{sep}{cell(parts?.m ?? null, "Min")}{sep}{cell(parts?.s ?? null, "Sec")}
 </div>
 );
}
