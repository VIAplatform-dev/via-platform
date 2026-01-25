export const dynamic = "force-dynamic";

import "./globals.css";
import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import Header from "./components/Header";
import Footer from "./components/Footer";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "VIA",
  description: "Curated vintage & resale, nationwide.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${cormorant.className} bg-white text-black`}>
      <Header />

      <main className="pt-20">
        {children}
      </main>
      <Footer />
      </body>
    </html>
  );
}

