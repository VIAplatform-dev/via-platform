"use client";

// An email preview that fits its frame.
//
// Every email is a fixed 600px table. In a frame narrower than that — a phone, a small modal — a
// plain iframe shows the left 340px and cuts the rest off, which is not what a phone mail app does:
// they fit the whole message to the screen. So below `below` the email renders at its natural width
// and is scaled down to the frame, filling the same box. At or above it this is the plain iframe it
// always was, so wide screens are unchanged.

import { useEffect, useRef, useState } from "react";
import { cn } from "../ui";

// The 600px table plus the template's 16px gutters — and above its 620px phone breakpoint, so the
// scaled copy is the desktop layout rather than a squeezed one.
const NATURAL = 640;

export function EmailFrame({ html, title, height, below = NATURAL, hidden, className }: {
 html: string; title: string; height: number; below?: number; hidden?: boolean; className?: string;
}) {
 const box = useRef<HTMLDivElement>(null);
 const [size, setSize] = useState<{ w: number; h: number } | null>(null);

 useEffect(() => {
  const el = box.current;
  if (!el || typeof ResizeObserver === "undefined") return;
  const ro = new ResizeObserver(([e]) => {
   const { width, height: h } = e.contentRect;
   if (width > 0) setSize({ w: width, h }); // a hidden frame measures 0 — keep the last real size
  });
  ro.observe(el);
  return () => ro.disconnect();
 }, []);

 const scale = size && size.w < below ? size.w / NATURAL : 1;

 return (
  <div ref={box} hidden={hidden} className={cn("relative overflow-hidden", className)} style={{ height }}>
   <iframe
    srcDoc={html}
    title={title}
    sandbox=""
    className="border-0 bg-white"
    style={size && scale < 1
     ? { width: NATURAL, height: size.h / scale, transform: `scale(${scale})`, transformOrigin: "top left" }
     : { width: "100%", height: "100%" }}
   />
  </div>
 );
}
