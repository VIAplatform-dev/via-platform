import type { Metadata } from "next";

// getvya.ai (the OS) carries its own favicon — the VYA monogram on a deep-navy tile — distinct
// from the marketplace's transparent mark set in the root layout. This server layout only exists
// to override the icons for every /infrastructure/* route (admin + infra pages); the interactive
// admin chrome stays in the nested client layout.
export const metadata: Metadata = {
 icons: {
 icon: "/infra/favicon.png",
 apple: "/infra/apple-touch-icon.png",
 },
};

export default function InfrastructureLayout({ children }: { children: React.ReactNode }) {
 return children;
}
