import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { AdminHide, MainWrapper } from "./components/RootLayoutWrapper";
import Script from "next/script";
import { SignUpProvider } from "./components/SignUpProvider";
import { AuthProvider } from "./components/AuthProvider";
import { FavoritesProvider } from "./components/FavoritesProvider";
import { FriendsProvider } from "./components/FriendsProvider";
import { CartProvider } from "./components/CartProvider";
import ScrollToTop from "./components/ScrollToTop";
import FeedbackModal from "./components/FeedbackModal";
import GlobalPageTracker from "./components/GlobalPageTracker";
import { Analytics } from "@vercel/analytics/next";
import FirebaseAnalyticsProvider from "./components/FirebaseAnalyticsProvider";

export const metadata: Metadata = {
 metadataBase: new URL("https://vyaplatform.com"),
 title: "VYA — The world's best vintage, all in one place.",
 description: "Shop from the best independent vintage and secondhand stores worldwide. The pieces you've been dreaming of. All trusted and verified stores.",
 keywords: ["vintage", "secondhand", "vintage clothing", "vintage platform", "independent vintage stores", "VYA platform", "designer vintage", "pre-loved fashion"],
 icons: {
 icon: "/icon.png",
 // apple-touch-icon is what link-preview compact cards show as the little mark;
 // use the V on a solid cream square so it never renders on a black background.
 apple: "/og-logo.png",
 },
 openGraph: {
 title: "The world's best vintage, all in one place.",
 description: "Shop from the best independent vintage and secondhand stores worldwide. The pieces you've been dreaming of. All trusted and verified stores.",
 url: "https://vyaplatform.com",
 siteName: "VYA",
 images: [{ url: "/og-hero.jpg", width: 1200, height: 630, alt: "VYA — the world's best vintage" }],
 type: "website",
 },
 twitter: {
 card: "summary_large_image",
 title: "The world's best vintage, all in one place.",
 description: "Shop from the best independent vintage and secondhand stores worldwide. The pieces you've been dreaming of.",
 images: ["/og-hero.jpg"],
 },
 other: {
 "p:domain_verify": "dcf6fca818d0ee26a40db310f2b0a1ba",
 },
};

export default function RootLayout({
 children,
}: {
 children: React.ReactNode;
}) {
 return (
 <html lang="en">
 <link rel="preconnect" href="https://fonts.googleapis.com" />
 <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
 <link
 rel="stylesheet"
 href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=Hanken+Grotesk:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&display=swap"
 />

 {/* Pinterest Tag */}
 <Script id="pinterest-tag" strategy="afterInteractive">
 {`
 !function(e){if(!window.pintrk){window.pintrk=function(){
 window.pintrk.queue.push(Array.prototype.slice.call(arguments))};
 var n=window.pintrk;n.queue=[],n.version="3.0";
 var t=document.createElement("script");
 t.async=!0,t.src=e;
 var r=document.getElementsByTagName("script")[0];
 r.parentNode.insertBefore(t,r)}}
 ("https://s.pinimg.com/ct/core.js");

 pintrk('load', '2614237582914');
 pintrk('page');
 `}
 </Script>

 <body className="bg-[#FFFDF8] text-[#5D0F17] overflow-x-hidden">
 <AuthProvider>
 <Suspense fallback={null}>
 <FirebaseAnalyticsProvider />
 </Suspense>
 <FavoritesProvider>
 <FriendsProvider>
 <CartProvider>
 <SignUpProvider>
 {/* <GiveawayProvider> */}
 <GlobalPageTracker />
 <ScrollToTop />
 <FeedbackModal />
 <AdminHide><Header /></AdminHide>
 <MainWrapper>{children}</MainWrapper>
 <AdminHide><Footer /></AdminHide>
 {/* </GiveawayProvider> */}
 <Analytics />
 </SignUpProvider>
 </CartProvider>
 </FriendsProvider>
 </FavoritesProvider>
 </AuthProvider>
 </body>
 </html>
 );
}
