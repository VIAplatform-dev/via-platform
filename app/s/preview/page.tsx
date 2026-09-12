import type { CSSProperties } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// THROWAWAY design preview of the hosted storefront. Hardcoded sample data, no
// DB — so the look can be seen on localhost while the real /s/[handle] route
// (which needs the database) can't run in this environment. Safe to delete.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = "force-static";

const ACCENT = "#5D0F17";
const STORE = { name: "In a Past Life", location: "New York, NY", tagline: "Curated vintage, one-of-one, archival, forever." };

type P = { name: string; price: string; image: string; size?: string };
const PRODUCTS: P[] = [
 { name: "Vintage Dior Croc Pumps", price: "$460", size: "US 8", image: "https://images.squarespace-cdn.com/content/v1/69815f50511d56376c42034b/09f10bef-691e-4a40-aec9-2df8ecd21176/F2924448-63D1-4BA3-ACAA-25C9D5CA1782.PNG" },
 { name: "Vintage Dior Heels", price: "$590", size: "US 7.5", image: "https://images.squarespace-cdn.com/content/v1/69815f50511d56376c42034b/8479446a-9e74-4740-953d-2f79129e335b/B671E797-6449-46EC-949A-FAD556330D27.PNG" },
 { name: "“I Love Dior” Ballet Flats", price: "$510", size: "US 8", image: "https://images.squarespace-cdn.com/content/v1/69815f50511d56376c42034b/0054e3af-90ef-4e1d-8035-398baa5976ce/vintage+dior+ballet+flats.jpg" },
 { name: "Vintage Dior Heels", price: "$700", size: "US 8.5", image: "https://images.squarespace-cdn.com/content/v1/69815f50511d56376c42034b/790eaade-f269-44b0-9e47-8082032b69ff/8114A2F0-0914-47B4-A164-22CED344BF74.PNG" },
 { name: "Chanel 2000 Cruise Top", price: "$650", size: "S", image: "https://images.squarespace-cdn.com/content/v1/692f0c19d6222d2cd49a182f/a47de8cb-9916-423c-b5a0-6575ae09f5f7/tempImageaK1au8.gif" },
 { name: "Gucci Heels", price: "$425", size: "US 7", image: "https://images.squarespace-cdn.com/content/v1/692f0c19d6222d2cd49a182f/90623b08-6062-400f-827b-4a1af0972354/tempImagegeHstQ.gif" },
 { name: "Mulberry Bayswater Bag", price: "$780", image: "https://images.squarespace-cdn.com/content/v1/68af5ed7f6ae17794a258dad/3ced8283-9bf1-4d40-9103-b12e98abf2e0/Bazaart_FBC89508-5862-4905-973B-3F1C103B5F5D.JPEG" },
 { name: "Chanel Lucky Charm Bag", price: "$2,000", image: "https://images.squarespace-cdn.com/content/v1/68af5ed7f6ae17794a258dad/b2062e2b-9f1c-4ccc-8ccb-57b940e09c51/Bazaart_D488F1FA-3BFD-4F62-9F74-00867CC51EA5.JPEG" },
 { name: "Fendi Beaded Baguette", price: "$4,000", image: "https://images.squarespace-cdn.com/content/v1/68af5ed7f6ae17794a258dad/654170a7-eaeb-4e90-955f-87d9a1935221/Bazaart_830B8CAB-9FA9-4558-B0AF-21814F4170B6.JPEG" },
 { name: "Louis Vuitton Murakami Mini Speedy", price: "$1,800", image: "https://images.squarespace-cdn.com/content/v1/68af5ed7f6ae17794a258dad/33a9bb6e-996d-46bf-81d8-3b25350c603b/Bazaart_DA0094DC-9408-4907-A08A-A5DC5F48C2C6.JPEG" },
 { name: "Ralph Lauren Cardigan", price: "$165", size: "M", image: "https://images.squarespace-cdn.com/content/v1/692f0c19d6222d2cd49a182f/82e4b561-4613-4558-8f01-002ab8379ccd/tempImagemWv1YL.gif" },
 { name: "Gucci Asymmetrical Top", price: "$325", size: "S", image: "https://images.squarespace-cdn.com/content/v1/692f0c19d6222d2cd49a182f/7169a104-2ebf-4197-acb9-2d6eb77459d5/tempImagedctRoC.gif" },
];

export default function StorefrontDesignPreview() {
 const accentStyle = { "--accent": ACCENT } as CSSProperties;
 return (
 <main style={accentStyle} className="min-h-screen bg-[#FFFDF8] text-[#241c17]">
 {/* preview ribbon */}
 <div className="bg-[#5D0F17] py-1.5 text-center text-[10px] uppercase tracking-[0.25em] text-[#FFFDF8]/80">
 Design preview · sample data
 </div>

 {/* branded header */}
 <header className="border-b border-black/10">
 <div className="mx-auto max-w-6xl px-6 py-14 text-center">
 <div className="mx-auto mb-5 h-[2px] w-12" style={{ background: "var(--accent)" }} />
 <h1 className="font-serif text-4xl sm:text-5xl" style={{ color: "var(--accent)" }}>{STORE.name}</h1>
 <p className="mt-4 mx-auto max-w-xl text-sm sm:text-base text-black/55">{STORE.tagline}</p>
 <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-black/40">{STORE.location}</p>
 </div>
 </header>

 {/* products */}
 <section className="mx-auto max-w-6xl px-5 sm:px-6 py-12">
 <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
 {PRODUCTS.map((p, i) => (
 <div key={i} className="group block">
 <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[3px] bg-[#efe6d7]">
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
 </div>
 <div className="mt-2.5">
 <p className="line-clamp-1 text-[13px] text-black/80">{p.name}</p>
 <p className="mt-0.5 text-[13px] font-medium" style={{ color: "var(--accent)" }}>{p.price}</p>
 {p.size && <p className="mt-0.5 text-[11px] text-black/40">Size {p.size}</p>}
 </div>
 </div>
 ))}
 </div>
 </section>

 <footer className="border-t border-black/10 py-8 text-center">
 <p className="text-[10px] uppercase tracking-[0.3em] text-black/35">
 Powered by <span style={{ color: "var(--accent)" }}>VYA</span>
 </p>
 </footer>
 </main>
 );
}
