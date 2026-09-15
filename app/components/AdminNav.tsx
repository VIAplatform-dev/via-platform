"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import {
 BarChart3,
 TrendingUp,
 LineChart,
 RotateCcw,
 ShoppingBag,
 Package,
 Users,
 Mail,
 Layers,
 RefreshCw,
 Link2,
 Store,
 LogOut,
 X,
 GitBranch,
 Search,
 Zap,
 Activity,
 Database,
 ClipboardCheck,
 Trash2,
 Tags,
} from "lucide-react";

const NAV_SECTIONS = [
 {
 label: "Analytics",
 items: [
 { label: "Command Center", href: "/admin/summary", icon: Activity },
 { label: "Overview", href: "/admin/key-metrics", icon: BarChart3 },
 { label: "Analytics", href: "/admin/analytics", icon: LineChart },
 { label: "Session Flows", href: "/admin/session-flows", icon: GitBranch },
 { label: "Search", href: "/admin/search-analytics", icon: Search },
 { label: "Market Data", href: "/admin/market-data", icon: TrendingUp },
 { label: "Data Layer", href: "/admin/data", icon: Database },
 { label: "Returns", href: "/admin/returns", icon: RotateCcw },
 ],
 },
 {
 label: "Commerce",
 items: [
 { label: "Conversions", href: "/admin/conversions", icon: ShoppingBag },
 { label: "Sourcing", href: "/admin/sourcing", icon: Package },
 ],
 },
 {
 label: "Users",
 items: [
 { label: "Customers", href: "/admin/customers", icon: Users },
 { label: "Emails", href: "/admin/emails", icon: Mail },
 ],
 },
 {
 label: "Content",
 items: [
 { label: "Collections", href: "/admin/collections", icon: Layers },
 ],
 },
 {
 label: "Operations",
 items: [
 { label: "Sync", href: "/admin/sync", icon: RefreshCw },
 { label: "Webhooks", href: "/admin/webhooks", icon: Zap },
 { label: "Collabs", href: "/admin/collabs-links", icon: Link2 },
 { label: "Stores", href: "/admin/stores", icon: Store },
 { label: "Listing Quality", href: "/admin/listing-quality", icon: ClipboardCheck },
 { label: "Category Sweep", href: "/admin/category-sweep", icon: Tags },
 { label: "Removed Items", href: "/admin/removed-items", icon: Trash2 },
 ],
 },
];

export default function AdminNav({
 mobileOpen = false,
 onMobileClose,
}: {
 mobileOpen?: boolean;
 onMobileClose?: () => void;
}) {
 const router = useRouter();
 const pathname = usePathname();

 async function handleLogout() {
 await fetch("/api/admin/auth", { method: "DELETE" });
 router.push("/admin/login");
 router.refresh();
 }

 return (
 <aside
 className={[
 "fixed top-0 left-0 h-screen overflow-y-auto flex flex-col z-[58]",
 "transition-transform duration-[220ms] ease-in-out",
 // Mobile: slide in/out. Desktop: always visible.
 mobileOpen ? "translate-x-0" : "-translate-x-full",
 "md:translate-x-0",
 ].join(" ")}
 style={{
 width: 220,
 background: "#0d0f12",
 borderRight: "1px solid rgba(255,255,255,0.05)",
 }}
 >
 {/* Logo + mobile close button */}
 <div style={{
 padding: "20px 16px 16px",
 borderBottom: "1px solid rgba(255,255,255,0.05)",
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 }}>
 <Link
 href="/admin/analytics"
 onClick={onMobileClose}
 style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
 >
 <Image src="/vya-logo.png" alt="VYA" width={28} height={28} style={{ objectFit: "contain" }} />
 <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600, letterSpacing: "0.05em" }}>
 VYA Admin
 </span>
 </Link>
 {/* Close button: mobile only */}
 <button
 onClick={onMobileClose}
 className="flex md:hidden items-center p-1"
 style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)" }}
 aria-label="Close menu"
 >
 <X size={16} />
 </button>
 </div>

 {/* Nav sections */}
 <nav style={{ flex: 1, padding: "12px 8px" }}>
 {NAV_SECTIONS.map((section) => (
 <div key={section.label} style={{ marginBottom: 20 }}>
 <div style={{
 fontSize: 10,
 fontWeight: 600,
 letterSpacing: "0.12em",
 textTransform: "uppercase",
 color: "rgba(255,255,255,0.25)",
 padding: "0 8px",
 marginBottom: 4,
 }}>
 {section.label}
 </div>
 {section.items.map((item) => {
 const active = pathname === item.href || pathname.startsWith(item.href + "/");
 const Icon = item.icon;
 return (
 <Link
 key={item.href}
 href={item.href}
 onClick={onMobileClose}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 9,
 padding: "7px 8px",
 borderRadius: 6,
 textDecoration: "none",
 fontSize: 13,
 fontWeight: active ? 500 : 400,
 color: active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)",
 background: active ? "rgba(255,255,255,0.07)" : "transparent",
 borderLeft: active ? "2px solid #c9a96e" : "2px solid transparent",
 transition: "all 0.12s",
 marginBottom: 1,
 }}
 >
 <Icon size={14} strokeWidth={1.75} style={{ flexShrink: 0, opacity: active ? 1 : 0.7 }} />
 {item.label}
 </Link>
 );
 })}
 </div>
 ))}
 </nav>

 {/* Logout */}
 <div style={{ padding: "12px 8px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
 <button
 onClick={handleLogout}
 style={{
 display: "flex",
 alignItems: "center",
 gap: 9,
 padding: "7px 8px",
 borderRadius: 6,
 fontSize: 13,
 color: "rgba(255,255,255,0.35)",
 background: "none",
 border: "none",
 cursor: "pointer",
 width: "100%",
 transition: "color 0.12s",
 }}
 >
 <LogOut size={14} strokeWidth={1.75} />
 Log out
 </button>
 </div>
 </aside>
 );
}
