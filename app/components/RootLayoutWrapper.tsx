"use client";

import { usePathname } from "next/navigation";

// Routes that render their own full-page chrome (no site Header/Footer/offset).
const STANDALONE = ["/admin", "/infrastructure", "/s/", "/checkout", "/store/", "/thread/"];
const isStandalone = (p: string) => STANDALONE.some((r) => p.startsWith(r));

// Hides its children on standalone routes without importing them (stays server-side)
export function AdminHide({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 if (isStandalone(pathname)) return null;
 return <>{children}</>;
}

// Conditionally applies the header offset padding
export function MainWrapper({ children }: { children: React.ReactNode }) {
 const pathname = usePathname();
 // Homepage hero is full-bleed under the transparent header; no top offset there.
 const noOffset = isStandalone(pathname) || pathname === "/";
 return <main className={noOffset ? "" : "pt-[56px]"}>{children}</main>;
}
