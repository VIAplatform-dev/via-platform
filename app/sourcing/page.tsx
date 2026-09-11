import type { Metadata } from "next";
import { Suspense } from "react";
import SourcingClient from "./SourcingClient";

export const metadata: Metadata = {
 title: "Personal Sourcing | VYA",
 description: "Tell us what you're looking for and our network of vintage experts will find it for you.",
 openGraph: {
 title: "Personal Sourcing | VYA",
 description: "Tell us what you're looking for and our network of vintage experts will find it for you.",
 images: [{ url: "/og-image.png", width: 1200, height: 630 }],
 },
 twitter: {
 card: "summary_large_image",
 title: "Personal Sourcing | VYA",
 description: "Tell us what you're looking for and our network of vintage experts will find it for you.",
 images: ["/og-image.png"],
 },
};

export default function SourcingPage() {
 return (
 <Suspense fallback={null}>
 <SourcingClient />
 </Suspense>
 );
}
