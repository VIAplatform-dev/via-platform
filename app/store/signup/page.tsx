import { Suspense } from "react";
import type { Metadata } from "next";
import StoreAuthClient from "@/app/store/StoreAuthClient";

export const metadata: Metadata = {
 title: "Create your store — VYA",
 description: "Set up your VYA store: list your inventory, take orders, and run your own storefront.",
 robots: { index: false, follow: false },
};

export default function StoreSignupPage() {
 return (
  <Suspense fallback={null}>
   <StoreAuthClient mode="signup" />
  </Suspense>
 );
}
