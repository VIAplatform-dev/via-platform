import type { Metadata } from "next";

// getvya.ai (the OS) carries its own favicon — the rose-gold VYA monogram on a transparent ground
// (apple-touch on white, since iOS icons can't be transparent). This server layout only exists to
// override the icons for every /infrastructure/* route (admin + infra pages); the interactive admin
// chrome stays in the nested client layout.
export const metadata: Metadata = {
 icons: {
 icon: [
 { url: "/infra/favicon-32.png", sizes: "32x32", type: "image/png" },
 { url: "/infra/favicon.png", sizes: "512x512", type: "image/png" },
 ],
 apple: "/infra/apple-touch-icon.png",
 },
};

export default function InfrastructureLayout({ children }: { children: React.ReactNode }) {
 return children;
}
