"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import AdminNav from "@/app/components/AdminNav";

export default function AdminShell({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 const isLogin = pathname === "/admin/login";
 const [sidebarOpen, setSidebarOpen] = useState(false);

 if (isLogin) return <>{children}</>;

 return (
 <div className="flex min-h-screen" style={{ fontFamily: "Arial, sans-serif" }}>
 {/* Mobile top bar: visible below md, hidden on desktop */}
 <div className="flex md:hidden fixed top-0 left-0 right-0 h-[52px] items-center px-4 z-[60]"
 style={{ background: "#0d0f12", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
 <button
 onClick={() => setSidebarOpen(true)}
 className="flex items-center p-1"
 style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)" }}
 >
 <Menu size={20} />
 </button>
 <span className="ml-3 text-[13px] font-semibold tracking-[0.05em]"
 style={{ color: "rgba(255,255,255,0.85)" }}>
 VYA Admin
 </span>
 </div>

 {/* Backdrop: mobile only, when sidebar is open */}
 {sidebarOpen && (
 <div
 onClick={() => setSidebarOpen(false)}
 className="md:hidden fixed inset-0 z-[55] bg-black/50"
 />
 )}

 <AdminNav mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

 {/* Main content: full width on mobile with top padding for the bar; offset by sidebar on desktop */}
 <main className="flex-1 pt-[52px] md:pt-0 md:ml-[220px]">
 {children}
 </main>
 </div>
 );
}
