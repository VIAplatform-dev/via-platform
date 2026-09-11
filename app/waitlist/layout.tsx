import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join VYA, The world's best vintage, all in one place.",
  description: "Shop vintage & secondhand from the best independent stores worldwide. Join the waitlist for early access to VYA.",
  openGraph: {
    title: "The world's best vintage, all in one place.",
    description: "Shop vintage & secondhand from the best independent stores worldwide. Join the waitlist for early access to VYA.",
    url: "https://vyaplatform.com/waitlist",
    siteName: "VYA",
    images: [
      {
        url: "https://vyaplatform.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "VYA, The world's best vintage, all in one place.",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The world's best vintage, all in one place.",
    description: "Shop vintage & secondhand from the best independent stores worldwide. Join the waitlist for early access to VYA.",
    images: ["https://vyaplatform.com/og-image.png"],
  },
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="fixed inset-0 z-[200] bg-[#FFFDF8] overflow-y-auto !pt-0">{children}</div>;
}
