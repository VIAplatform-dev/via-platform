import "./globals.css";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";

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
      <body className="bg-black text-white">
        {/* HEADER */}
        <header className="w-full border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <a href="/" className="text-xl font-bold">
              VIA
            </a>

            <nav className="flex items-center gap-6">
              <a
                href="/for-stores"
                className="text-gray-400 hover:text-white transition"
              >
                For Stores
              </a>

              <a
                href="https://viaplatform.carrd.co/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-white px-4 py-2 text-black font-medium hover:bg-gray-200 transition"
              >
                Join Waitlist
              </a>
            </nav>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </main>

        {/* FOOTER */}
        <footer className="mt-32 border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-6 text-sm text-gray-400">
            <p>© VIA 2026 — Curated vintage & resale, nationwide.</p>

            <div className="flex items-center gap-6">
              <a
                href="https://www.instagram.com/viaplatform"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition"
              >
                Instagram
              </a>

              <span className="text-gray-600">
                Vetted partners · Early access
              </span>
            </div>
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}



