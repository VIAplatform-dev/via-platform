"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";

interface Story {
 slug: string;
 store: string;
 teaser: string;
 image: string;
 logo: string;
 logoBg: string;
 logoDark?: boolean;
}

export default function StoriesHero({ stories }: { stories: Story[] }) {
 const [current, setCurrent] = useState(0);

 const next = useCallback(() => {
 setCurrent((prev) => (prev + 1) % stories.length);
 }, [stories.length]);

 const prev = useCallback(() => {
 setCurrent((prev) => (prev - 1 + stories.length) % stories.length);
 }, [stories.length]);

 // Auto-advance every 6 seconds
 useEffect(() => {
 const timer = setInterval(next, 6000);
 return () => clearInterval(timer);
 }, [next]);

 const story = stories[current];

 return (
 <div className="overflow-hidden rounded-sm">
 {/* Mobile: stacked, Desktop: two columns */}
 <div className="flex flex-col md:grid md:grid-cols-2 md:min-h-[560px]">
 {/* Image, on top for mobile, right side for desktop */}
 <div className="relative aspect-[16/9] md:aspect-auto md:order-2">
 {stories.map((s, i) => {
 const next = (current + 1) % stories.length;
 if (i !== current && i !== next) return null;
 return (
 <div
 key={s.slug}
 className="absolute inset-0 transition-opacity duration-1000"
 style={{ opacity: i === current ? 1 : 0 }}
 >
 <Image
 src={s.image}
 alt={s.store}
 fill
 className="object-cover"
 />
 </div>
 );
 })}
 </div>

 {/* Logo + text panel. Below image on mobile, left side for desktop */}
 <div className="flex flex-col justify-center items-center text-center px-6 sm:px-12 py-10 sm:py-16 bg-[#FFFDF8] md:order-1">
 {/* Store name */}
 <div
 key={story.slug + "-name"}
 className="animate-fade-in mb-5 sm:mb-8"
 >
 <p className="text-xs uppercase tracking-[0.2em] text-[#5D0F17]/50 mb-2 font-sans">A story from</p>
 <h3 className="text-2xl sm:text-3xl font-serif text-[#5D0F17]">{story.store}</h3>
 </div>

 {/* Teaser */}
 <p
 key={story.slug + "-teaser"}
 className="animate-fade-in max-w-sm text-[#5D0F17]/60 text-sm sm:text-base leading-relaxed mb-6 sm:mb-8 italic font-serif"
 >
 &ldquo;{story.teaser}&rdquo;
 </p>

 <Link
 href={`/stories/${story.slug}`}
 className="inline-block bg-[#5D0F17] text-[#FFFDF8] px-8 py-3 text-xs uppercase tracking-[0.15em] hover:bg-[#5D0F17]/85 transition"
 >
 Read Story
 </Link>

 {/* Navigation */}
 <div className="flex items-center gap-4 mt-6 sm:mt-8">
 <button
 onClick={prev}
 aria-label="Previous story"
 className="text-[#5D0F17]/30 hover:text-[#5D0F17] transition text-sm"
 >
 &larr;
 </button>
 <div className="flex gap-2">
 {stories.map((_, i) => (
 <button
 key={i}
 onClick={() => setCurrent(i)}
 aria-label={`Go to story ${i + 1}`}
 className={`h-[2px] transition-all duration-500 ${
 i === current
 ? "w-8 bg-[#5D0F17]"
 : "w-4 bg-[#5D0F17]/20 hover:bg-[#5D0F17]/40"
 }`}
 />
 ))}
 </div>
 <button
 onClick={next}
 aria-label="Next story"
 className="text-[#5D0F17]/30 hover:text-[#5D0F17] transition text-sm"
 >
 &rarr;
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}
