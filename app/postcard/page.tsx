import { notFound } from "next/navigation";
import FlyerLanding from "@/app/components/FlyerLanding";
import { flyerBySlug } from "@/app/lib/flyers";

// Printed flyer landing — vyaplatform.com/postcard
//
// A real route rather than a redirect, so the address on the paper is the address in the bar.
// This path is listed in proxy.ts's PUBLIC_ROUTES; without that every scan reaches /login.

export const dynamic = "force-dynamic"; // the gate depends on a cookie, so it can never be cached

export const metadata = {
 title: "You found us. — VYA",
 description: "Archive fashion from vintage stores around the world — skip the waitlist.",
};

export default async function Page() {
 const flyer = flyerBySlug("postcard");
 if (!flyer) notFound();
 return <FlyerLanding flyer={flyer} />;
}
