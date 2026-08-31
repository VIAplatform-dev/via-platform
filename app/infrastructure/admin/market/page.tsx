"use client";

import { Suspense, useEffect, useState } from "react";
import { Camera, Plus } from "lucide-react";
import { B, BigLink, MarketPage, Notice, api, href, money } from "./ui";
import ReadinessTasks from "./ReadinessTasks";

type Home = {
 session: { id: string; name: string; createdAt: string };
 payments: { chargesEnabled: boolean };
 counts: { available: number; brought: number; broughtLeft: number; broughtValueCents: number; soldToday: number; grossTodayCents: number; cashCents: number; cardCents: number };
 inProgress: { id: string; itemId: string; amountCents: number; createdAt: string }[];
};

const WINE = "#5D0F17";

// "Wine band + sheet": the band carries where you are and how the day is going; the white sheet
// rising over it carries the two things you do. Numbers in Newsreader, everything one thumb away.
function HomeInner() {
 const [home, setHome] = useState<Home | null>(null);
 const [err, setErr] = useState<string | null>(null);
 useEffect(() => {
 api<Home>("/api/store/market/home").then((r) => (r.ok ? setHome(r.data) : setErr(r.data.error || "Couldn't load")));
 }, []);
 const c = home?.counts;
 const left = c ? Math.max(0, c.available) : null;
 // The auto-named session ("Market · Aug 28") already carries the date — don't print it twice.
 const rawDate = home ? new Date(home.session.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "";
 const monthDay = home ? new Date(home.session.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
 const date = home && !home.session.name.includes(monthDay) ? rawDate : "";

 return (
 <MarketPage className="!pt-0 sm:!pt-0">
 {/* Band — bleeds to the page edges on phones, rounded card on desktop. */}
 <div className="-mx-4 px-5 pb-14 pt-6 text-white sm:-mx-6 sm:rounded-b-[28px] sm:px-7 sm:pt-8" style={{ background: WINE }}>
 <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/70">Selling in person</p>
 <h1 className="mt-1.5 text-[30px] font-medium leading-[1.05] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
 {home ? home.session.name : "Market"}{date && <><br /><span className="text-white/80">{date}</span></>}
 </h1>
 <div className="mt-4 flex gap-6 text-[12.5px] text-white/85">
 <span><b className="block text-[20px] font-medium leading-none" style={{ fontFamily: "var(--font-display)" }}>{c ? money(c.grossTodayCents) : "—"}</b>today</span>
 <span><b className="block text-[20px] font-medium leading-none" style={{ fontFamily: "var(--font-display)" }}>{c ? c.soldToday : "—"}</b>sold</span>
 <span><b className="block text-[20px] font-medium leading-none" style={{ fontFamily: "var(--font-display)" }}>{left ?? "—"}</b>on the rack</span>
 {c && c.brought > 0 && <span><b className="block text-[20px] font-medium leading-none" style={{ fontFamily: "var(--font-display)" }}>{c.broughtLeft}<span className="text-[13px] text-white/60">/{c.brought}</span></b>brought · {money(c.broughtValueCents)} left</span>}
 </div>
 {c && (c.cashCents > 0 || c.cardCents > 0) && <p className="mt-3 text-[12.5px] text-white/75">In the tin: <b className="text-white">{money(c.cashCents)}</b> cash · <b className="text-white">{money(c.cardCents)}</b> card</p>}
 </div>

 {/* Sheet */}
 <div className="-mt-8 rounded-[22px] border border-stone-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-20px_rgba(16,24,40,0.25)]">
 {err && <div className="mb-3"><Notice tone="danger">{err}</Notice></div>}
 <BigLink href={href(`${B}/find`)} className="min-h-[68px] text-[18px]"><Camera size={24} /> Find item</BigLink>
 <BigLink href={href(`${B}/quick`)} variant="secondary" className="mt-2 min-h-[56px]"><Plus size={22} /> Quick list</BigLink>
 {home?.inProgress.map((k) => (
 <a key={k.id} href={href(`${B}/checkout/${k.id}`)} className="mt-2 flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13.5px]" style={{ background: "rgba(93,15,23,.08)", color: "#1c1917" }}>
 <span><b className="font-semibold">{money(k.amountCents)}</b> checkout in progress</span>
 <span className="ml-auto font-semibold" style={{ color: WINE }}>Resume ›</span>
 </a>
 ))}
 <ReadinessTasks compact />
 </div>

 <p className="mb-2 mt-6 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">Payments</p>
 <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[13.5px]">
 <span className="text-stone-700">{home === null ? "…" : home.payments.chargesEnabled ? "Cards and cash" : "Cash only"}</span>
 {home && !home.payments.chargesEnabled
 ? <a href={href("/admin/payments")} className="font-semibold" style={{ color: WINE }}>Set up cards ›</a>
 : <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Ready</span>}
 </div>
 </MarketPage>
 );
}

export default function MarketHome() {
 return <Suspense fallback={null}><HomeInner /></Suspense>;
}
