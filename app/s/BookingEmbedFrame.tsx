"use client";

import { useState } from "react";
import { providerLabel, type BookingEmbed } from "@/app/lib/appointments/embed-core";

/**
 * A shop's own scheduling page, shown in place.
 *
 * Sending a shopper to another website to pick a time loses some of them, so where the provider
 * supports being framed we show the real calendar here. The link stays underneath regardless: an
 * iframe can be blocked by a browser, an extension, or the provider changing its mind, and a
 * shopper should never be left looking at an empty box with no way forward.
 */
export default function BookingEmbedFrame({
 embed, url, accent, cta = "Book it", inert = false,
}: { embed: BookingEmbed; url: string; accent: string; cta?: string; inert?: boolean }) {
 const [failed, setFailed] = useState(false);

 if (failed) {
  return (
   <a
    href={url} target="_blank" rel="noreferrer"
    className="vya-cta block w-full px-8 py-3.5 text-center text-[11px] uppercase tracking-[0.2em] transition hover:opacity-85"
    style={{ background: accent, color: "#fff" }}
   >{cta}</a>
  );
 }

 return (
  <div className="flex flex-col gap-3">
   <div className="vya-round overflow-hidden border border-current/12" style={inert ? { pointerEvents: "none" } : undefined}>
    <iframe
     src={embed.src}
     title={`Book a time — ${providerLabel(embed.provider)}`}
     loading="lazy"
     onError={() => setFailed(true)}
     className="w-full"
     style={{ height: embed.minHeight, border: 0 }}
    />
   </div>
   <a href={url} target="_blank" rel="noreferrer" className="self-start text-[12px] underline underline-offset-4 opacity-60 hover:opacity-100">
    Open in {providerLabel(embed.provider)}
   </a>
  </div>
 );
}
