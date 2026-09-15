"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const MembershipCheckout = dynamic(() => import("./MembershipCheckout"), { ssr: false });

export default function MembershipCTA({ isLoggedIn }: { isLoggedIn: boolean }) {
 const [showCheckout, setShowCheckout] = useState(false);
 const router = useRouter();

 function handleJoin() {
 if (!isLoggedIn) {
 router.push("/login?callbackUrl=/membership");
 return;
 }
 setShowCheckout(true);
 }

 if (showCheckout) {
 return <MembershipCheckout onCancel={() => setShowCheckout(false)} />;
 }

 return (
 <button
 onClick={handleJoin}
 className="w-full text-sm uppercase tracking-wide px-8 py-3 bg-black text-white hover:bg-black/85 transition"
 >
 Join VYA Insider: $10/month
 </button>
 );
}
