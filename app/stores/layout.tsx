import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stores | VYA",
  description: "Explore our curated selection of the world's best independent vintage and secondhand stores, all verified by VYA.",
  openGraph: {
    title: "Stores | VYA",
    description: "Explore our curated selection of the world's best independent vintage and secondhand stores, all verified by VYA.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stores | VYA",
    description: "Explore our curated selection of the world's best independent vintage and secondhand stores, all verified by VYA.",
    images: ["/og-image.png"],
  },
};

export default function StoresLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
