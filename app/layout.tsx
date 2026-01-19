import "./globals.css";
import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import Header from "./components/Header";

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

<footer className="mt-32 py-12 border-t border-neutral-200">
  <div className="max-w-7xl mx-auto px-6">
    <span>© 2026 VIA — Curated vintage & resale, nationwide.</span>

    <a
      href="https://instagram/theviaplatform.com"
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline underline-offset-4"
    >
      Instagram
    </a>
  </div>
</footer>
      </body>
    </html>
  );
}

