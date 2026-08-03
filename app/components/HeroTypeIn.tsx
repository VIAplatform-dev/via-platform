"use client";

import { useEffect, useState } from "react";

/**
 * Rotating typewriter for the hero headline. Types a phrase, holds, deletes,
 * then advances to the next — looping forever. Each phrase's full text is
 * rendered as an invisible sizing layer so the typed overlay fills into place
 * without reflow (the buttons below never jump). Respects reduced-motion.
 */
export default function HeroTypeIn({
 phrases = [],
 className,
 speed = 55,
 deleteSpeed = 28,
 holdTime = 1800,
}: {
 phrases: string[];
 className?: string;
 speed?: number;
 deleteSpeed?: number;
 holdTime?: number;
}) {
 const [index, setIndex] = useState(0);
 const [count, setCount] = useState(0);
 const [phase, setPhase] = useState<"typing" | "deleting">("typing");
 const [reduced, setReduced] = useState(false);

 useEffect(() => {
 if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
 setReduced(true);
 }
 }, []);

 useEffect(() => {
 if (reduced) return;
 const current = phrases[index] ?? "";
 let t: ReturnType<typeof setTimeout>;
 if (phase === "typing") {
 if (count < current.length) {
 t = setTimeout(() => setCount(count + 1), speed);
 } else {
 t = setTimeout(() => setPhase("deleting"), holdTime);
 }
 } else {
 if (count > 0) {
 t = setTimeout(() => setCount(count - 1), deleteSpeed);
 } else {
 t = setTimeout(() => {
 setIndex((index + 1) % phrases.length);
 setPhase("typing");
 }, 280);
 }
 }
 return () => clearTimeout(t);
 }, [count, phase, index, reduced, phrases, speed, deleteSpeed, holdTime]);

 const current = phrases[index] ?? "";
 const visible = reduced ? current : current.slice(0, count);

 return (
 <h1 className={`relative ${className ?? ""}`} aria-label={phrases[0]} style={{ minHeight: "2.2em" }}>
 {/* sizing layer — reserves the current phrase's box, no reflow while typing */}
 <span className="opacity-0" aria-hidden="true">{current}</span>
 {/* typed overlay */}
 <span className="absolute inset-0" aria-hidden="true">
 {visible}
 {!reduced && <span className="hero-caret">|</span>}
 </span>
 </h1>
 );
}
