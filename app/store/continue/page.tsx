import { Suspense } from "react";
import ContinueClient from "./ContinueClient";

export const metadata = { robots: { index: false, follow: false } };

export default function StoreContinuePage() {
 return (
  <Suspense fallback={null}>
   <ContinueClient />
  </Suspense>
 );
}
