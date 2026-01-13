import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      
      {/* LOGO */}
      {/* HERO TITLE (logo is the H1) */}
<h1 style={{ marginBottom: "32px" }}>
  <Image
    src="/via-logo-black.png"
    alt="VIA — curated vintage & resale marketplace"
    width={240}
    height={140}
    priority
  />
</h1>

{/* HERO TITLE */}
<h1
  style={{
    fontFamily: "var(--font-cormorant)",
    fontSize: "88px",
    fontWeight: 300,
    letterSpacing: "0.08em",
    marginBottom: "24px",
  }}
>
</h1>

      {/* HER{/* HERO TITLE */}
      <p
  style={{
    fontFamily: "var(--font-cormorant)",
    fontSize: "22px",
    fontWeight: 300,
    maxWidth: "720px",
    color: "#9CA3AF",
    marginBottom: "48px",
    lineHeight: 1.6,
  }}
>
  Shop curated vintage & resale from the best independent stores — all in one place.
</p>

      {/* CTA BUTTONS */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <a
          href="https://viaplatform.carrd.co"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-white text-black px-8 py-4 font-medium hover:bg-gray-200 transition"
        >
          Join the waitlist
        </a>

        <Link
          href="/stores"
          className="rounded-lg border border-gray-700 px-8 py-4 font-medium hover:border-white transition"
        >
          Browse stores
        </Link>
      </div>

      {/* STORE LINK */}
      <Link
        href="/for-stores"
        className="text-gray-400 underline underline-offset-4 hover:text-white transition"
      >
        Are you a store? →
      </Link>

    </main>
  );
}
