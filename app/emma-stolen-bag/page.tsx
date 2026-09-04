import { notFound } from "next/navigation";
import FlyerLanding from "@/app/components/FlyerLanding";
import { flyerBySlug } from "@/app/lib/flyers";

// Printed flyer landing — vyaplatform.com/emma-stolen-bag
//
// A real route rather than a redirect, so the address on the paper is the address in the bar.
// This path is listed in proxy.ts's PUBLIC_ROUTES; without that every scan reaches /login.

export const dynamic = "force-dynamic"; // the gate depends on a cookie, so it can never be cached

export const metadata = {
 title: "Emma, I know you stole my Fendi baguette. — VYA",
 description: "Get your own. Archive pieces from vintage stores around the world.",
};

export default async function Page() {
 const flyer = flyerBySlug("emma-stolen-bag");
 if (!flyer) notFound();
 return <FlyerLanding flyer={flyer} />;
}
