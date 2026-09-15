import Link from "next/link";
import Image from "next/image";

export default function FeaturedDesignerSection() {
 return (
 <section className="">
 <Link href="/search?q=dior" className="block relative w-full overflow-hidden group" style={{ aspectRatio: "16/7", minHeight: "260px" }}>
 <Image
 src="/featured-dior-5.jpg"
 alt="Christian Dior"
 fill
 sizes="100vw"
 className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
 loading="lazy"
 />
 {/* Dark gradient overlay on left */}
 <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/20 to-transparent" />

 {/* Text overlay: bottom-left, Ralph Lauren style */}
 <div className="absolute bottom-10 left-10 sm:bottom-14 sm:left-14 text-[#FFFDF8]">
 <p className="text-xs uppercase tracking-[0.18em] mb-2 font-sans opacity-80">
 Featured Designer
 </p>
 <h2 className="text-5xl sm:text-6xl md:text-7xl font-serif mb-5 leading-none">
 Dior
 </h2>
 <span className="inline-block text-xs uppercase tracking-[0.15em] border-b border-[#FFFDF8]/70 pb-0.5 font-sans hover:opacity-70 transition-opacity">
 Shop Now
 </span>
 </div>
 </Link>
 </section>
 );
}
