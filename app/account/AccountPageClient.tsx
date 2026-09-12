"use client";

import { useState } from "react";
import Link from "next/link";
import InviteButton from "./InviteButton";
import SavesTab from "./tabs/SavesTab";
import ForYouTab from "./tabs/ForYouTab";
import PurchasesTab from "./tabs/PurchasesTab";
import CollectionsTab from "./tabs/CollectionsTab";
import StoresTab from "./tabs/StoresTab";
import type { FavoriteProductEntry } from "@/app/lib/favorites-db";

type Tab = "favorites" | "for-you" | "purchases" | "collections" | "stores";

type Props = {
 userId: string;
 name: string | null;
 email: string | null;
 image: string | null;
 favoritesCount: number;
 storesCount: number;
 favProducts: FavoriteProductEntry[];
 referralCode?: string | null;
 referralCount?: number;
 isInsider?: boolean;
};

export default function AccountPageClient({
 userId,
 name,
 email,
 image,
 favoritesCount,
 storesCount,
 favProducts,
 referralCode,
 referralCount = 0,
 isInsider,
}: Props) {
 const [tab, setTab] = useState<Tab>("favorites");

 const handle = email ? `@${email.split("@")[0]}` : "@me";
 const displayName = name || email?.split("@")[0] || "My Account";
 const initials = (name?.[0] || email?.[0] || "?").toUpperCase();

 const tabs: { key: Tab; label: string }[] = [
 { key: "favorites", label: "Saves" },
 { key: "for-you", label: "For You" },
 { key: "purchases", label: "Purchases" },
 { key: "collections", label: "Collections" },
 { key: "stores", label: "Stores" },
 ];

 return (
 <main className="bg-[#FFFDF8] min-h-screen text-[#5D0F17]">
 {/* ── Profile Header ── */}
 <div className="max-w-2xl lg:max-w-6xl mx-auto px-6 pt-8 pb-0">

 {/* Top row: handle + icon links */}
 <div className="flex items-center justify-between mb-4">
 <p className="text-xs text-[#5D0F17]/40 uppercase tracking-widest">{handle}</p>
 <div className="flex items-center gap-4">
 <Link
 href="/account/friends"
 className="text-xs uppercase tracking-[0.12em] text-[#5D0F17]/40 hover:text-[#5D0F17] transition"
 >
 Friends
 </Link>
 <Link
 href="/account/settings"
 className="text-xs uppercase tracking-[0.12em] text-[#5D0F17]/40 hover:text-[#5D0F17] transition"
 >
 Settings
 </Link>
 </div>
 </div>

 {/* Name + Avatar */}
 <div className="flex items-end justify-between gap-6 mb-4">
 <div>
 <h1 className="text-3xl font-serif text-[#5D0F17] leading-tight mb-2">{displayName}</h1>
 <div className="flex items-center gap-3 text-xs text-[#5D0F17]/40 uppercase tracking-wider">
 <span>{favoritesCount} saves</span>
 <span>·</span>
 <span>{storesCount} stores</span>
 {isInsider && (
 <span className="text-[#5D0F17]/70 border border-[#5D0F17]/30 px-2 py-0.5 tracking-widest">
 ✦ Insider
 </span>
 )}
 </div>
 </div>
 <div className="w-14 h-14 rounded-full bg-[#D8CABD]/40 flex items-center justify-center overflow-hidden shrink-0 mb-1">
 {image ? (
 <img src={image} alt="" className="w-full h-full object-cover" />
 ) : (
 <span className="text-lg font-serif text-[#5D0F17]/40">{initials}</span>
 )}
 </div>
 </div>

 {/* Action buttons */}
 <div className="flex gap-2 mb-6">
 <Link
 href="/account/settings"
 className="px-5 py-2.5 text-xs uppercase tracking-[0.12em] border border-[#5D0F17]/25 text-[#5D0F17]/70 hover:border-[#5D0F17]/60 hover:text-[#5D0F17] transition whitespace-nowrap"
 >
 Edit Profile
 </Link>
 </div>

 {/* ── Insider Banner ── */}
 {isInsider ? (
 <div className="mb-6 px-5 py-4 border border-[#5D0F17]/20 bg-[#5D0F17]/[0.03] flex items-center justify-between gap-4 flex-wrap">
 <div>
 <p className="text-xs uppercase tracking-widest text-[#5D0F17]/50 mb-0.5">✦ VYA Insider</p>
 <p className="text-sm text-[#5D0F17]/70">You're on our bimonthly newsletter, inside scoops, styling tips, and trend breakdowns, just for you.</p>
 </div>
 </div>
 ) : (
 <div className="mb-6 px-5 py-4 border border-[#5D0F17]/15 flex flex-col sm:flex-row sm:items-center gap-4">
 <div className="flex-1 min-w-0">
 <p className="text-xs uppercase tracking-widest text-[#5D0F17]/40 mb-1">✦ Become a VYA Insider</p>
 <p className="text-sm text-[#5D0F17]/70 leading-relaxed">
 {referralCount === 0
 ? "Invite 2 friends and unlock our bimonthly newsletter, inside scoops, styling tips, and trend breakdowns."
 : "Invite 1 more friend to unlock Insider access and our bimonthly newsletter."}
 </p>
 <div className="flex items-center gap-2 mt-3">
 {[0, 1].map((i) => (
 <div
 key={i}
 className={`w-5 h-5 rounded-full border flex items-center justify-center text-[9px] transition-colors ${
 i < referralCount
 ? "border-[#5D0F17] bg-[#5D0F17] text-[#FFFDF8]"
 : "border-[#5D0F17]/25 text-[#5D0F17]/25"
 }`}
 >
 {i < referralCount ? "✓" : i + 1}
 </div>
 ))}
 <span className="text-xs text-[#5D0F17]/40 ml-1">
 {referralCount >= 2 ? "Complete" : `${referralCount} of 2 friends invited`}
 </span>
 </div>
 </div>
 <div className="shrink-0">
 <InviteButton label="Invite Friends" referralCode={referralCode} compact />
 </div>
 </div>
 )}

 {/* Tab bar */}
 <div className="flex overflow-x-auto scrollbar-hide -mx-6 px-6 border-b border-[#5D0F17]/10">
 {tabs.map((t) => (
 <button
 key={t.key}
 onClick={() => setTab(t.key)}
 className={`shrink-0 px-4 py-3 text-xs uppercase tracking-[0.1em] font-medium transition-colors relative whitespace-nowrap ${
 tab === t.key
 ? "text-[#5D0F17]"
 : "text-[#5D0F17]/35 hover:text-[#5D0F17]/65"
 }`}
 >
 {t.label}
 {tab === t.key && (
 <span className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#5D0F17]" />
 )}
 </button>
 ))}
 </div>
 </div>

 {/* ── Tab Content ── */}
 <div className="max-w-2xl lg:max-w-6xl mx-auto px-6 py-8">
 {tab === "favorites" && <SavesTab userId={userId} favProducts={favProducts} />}
 {tab === "for-you" && <ForYouTab hasFavorites={favProducts.length > 0} />}
 {tab === "purchases" && <PurchasesTab />}
 {tab === "collections" && <CollectionsTab userId={userId} />}
 {tab === "stores" && <StoresTab userId={userId} />}
 </div>
 </main>
 );
}
