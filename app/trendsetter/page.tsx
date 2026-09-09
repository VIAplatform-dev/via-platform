import { notFound } from "next/navigation";
import FlyerLanding from "@/app/components/FlyerLanding";
import { flyerBySlug } from "@/app/lib/flyers";

// Printed flyer landing — vyaplatform.com/trendsetter
//
// A real route rather than a redirect, so the address on the paper is the address in the bar.
// This path is listed in proxy.ts's PUBLIC_ROUTES; without that every scan reaches /login.

export const dynamic = "force-dynamic"; // the gate depends on a cookie, so it can never be cached

export const metadata = {
 title: "Are you a trendsetter? — VYA",
 description: "We got you. One-of-one archive pieces you will not see on anyone else.",
};

export default async function Page() {
 const flyer = flyerBySlug("trendsetter");
 if (!flyer) notFound();
 return <FlyerLanding flyer={flyer} />;
}
