import { notFound } from "next/navigation";
import FlyerLanding from "@/app/components/FlyerLanding";
import { flyerBySlug } from "@/app/lib/flyers";

// Printed flyer landing — vyaplatform.com/not-shein
//
// A real route rather than a redirect, so the address on the paper is the address in the bar.
// This path is listed in proxy.ts's PUBLIC_ROUTES; without that every scan reaches /login.

export const dynamic = "force-dynamic"; // the gate depends on a cookie, so it can never be cached

export const metadata = {
 title: "For the girls who don't shop at Shein. — VYA",
 description: "Real vintage from real stores. Nothing mass-produced, nothing repeated.",
};

export default async function Page() {
 const flyer = flyerBySlug("not-shein");
 if (!flyer) notFound();
 return <FlyerLanding flyer={flyer} />;
}
