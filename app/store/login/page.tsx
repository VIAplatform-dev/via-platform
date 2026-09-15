import { Suspense } from "react";
import type { Metadata } from "next";
import StoreAuthClient from "@/app/store/StoreAuthClient";

export const metadata: Metadata = {
 title: "Sign in to your store. VYA",
 description: "Sign in to your VYA store to manage listings, orders and your storefront.",
 robots: { index: false, follow: false },
};

export default function StoreLoginPage() {
 return (
  <Suspense fallback={null}>
   <StoreAuthClient mode="login" />
  </Suspense>
 );
}
