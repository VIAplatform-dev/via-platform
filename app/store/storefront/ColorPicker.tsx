"use client";

// The visual colour picker used across the storefront editors — a draggable saturation/value square + a
// hue bar + a hex field (like Figma/Canva), plus a swatch that opens it in a popover. Shared so both the
// blocks studio and the captured-site editor use the exact same control (never the native OS picker).
import { useRef, useState } from "react";
import { createPortal } from "react-dom";

// A hex-code field so sellers can type/paste a colour (e.g. #5A0E17). Applies only on a valid 6-digit hex.
export function HexInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
 const [txt, setTxt] = useState(value);
 const [lastValue, setLastValue] = useState(value);
 if (value !== lastValue) { setLastValue(value); setTxt(value); } // resync when the colour changes elsewhere
 return (
 <input
 value={txt}
 spellCheck={false}
 onClick={(e) => e.stopPropagation()}
 onChange={(e) => { let v = e.target.value.trim(); if (v && !v.startsWith("#")) v = "#" + v; setTxt(v); if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v); }}
 onBlur={() => { if (!/^#[0-9a-fA-F]{6}$/.test(txt)) setTxt(value); }}
 className={className}
 />
 );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
 const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
 if (!m) return { h: 0, s: 0, v: 0 };
 const r = parseInt(m[1].slice(0, 2), 16) / 255, g = parseInt(m[1].slice(2, 4), 16) / 255, b = parseInt(m[1].slice(4, 6), 16) / 255;
 const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
 let h = 0;
 if (d !== 0) { if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
 return { h, s: max === 0 ? 0 : d / max, v: max };
}
export function hsvToHex(h: number, s: number, v: number): string {
 const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
 let r = 0, g = 0, b = 0;
 if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
 else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
 const hx = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
 return `#${hx(r)}${hx(g)}${hx(b)}`;
}
export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const [hsv, setHsv] = useState(() => hexToHsv(value));
 const [last, setLast] = useState(value);
 if (value !== last) { setLast(value); setHsv(hexToHsv(value)); }
 const svRef = useRef<HTMLDivElement>(null);
 const hueRef = useRef<HTMLDivElement>(null);
 const commit = (h: number, s: number, v: number) => { const hex = hsvToHex(h, s, v); setHsv({ h, s, v }); setLast(hex); onChange(hex); };
 const dragSV = (e: React.PointerEvent) => {
 e.preventDefault();
 const h = hsv.h;
 const apply = (cx: number, cy: number) => { const el = svRef.current; if (!el) return; const r = el.getBoundingClientRect(); commit(h, clamp01((cx - r.left) / r.width), clamp01(1 - (cy - r.top) / r.height)); };
 apply(e.clientX, e.clientY);
 const move = (ev: PointerEvent) => apply(ev.clientX, ev.clientY);
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
 window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
 };
 const dragHue = (e: React.PointerEvent) => {
 e.preventDefault();
 const s = hsv.s, v = hsv.v;
 const apply = (cx: number) => { const el = hueRef.current; if (!el) return; const r = el.getBoundingClientRect(); commit(clamp01((cx - r.left) / r.width) * 360, s, v); };
 apply(e.clientX);
 const move = (ev: PointerEvent) => apply(ev.clientX);
 const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
 window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
 };
 return (
 <div className="select-none">
 <div ref={svRef} onPointerDown={dragSV} className="relative h-32 w-full cursor-crosshair touch-none rounded-lg" style={{ background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))` }}>
 <span className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
 </div>
 <div ref={hueRef} onPointerDown={dragHue} className="relative mt-3 h-3.5 w-full cursor-pointer touch-none rounded-full" style={{ background: "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)" }}>
 <span className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h}, 100%, 50%)` }} />
 </div>
 <div className="mt-3 flex items-center gap-2">
 <span className="h-6 w-6 shrink-0 rounded-md ring-1 ring-black/10" style={{ background: value }} />
 <HexInput value={value} onChange={onChange} className="w-full rounded-md border border-black/10 bg-white px-2 py-1 text-[12px] uppercase text-stone-700 outline-none focus:border-[#5D0F17]/50" />
 </div>
 </div>
 );
}
// The picker popover, positioned `fixed` to the anchor button's rect. Portaled to <body> so it escapes
// BOTH overflow-clipping AND transformed ancestors — a `transform` on an ancestor would otherwise make
// `position: fixed` resolve against that ancestor (not the viewport), re-clipping the popover (e.g. the
// element toolbar, which is translateX(-50%) + overflow-x-auto — the swatch popover was invisible there).
export function PickerPopover({ anchor, value, onChange, onClose }: { anchor: DOMRect; value: string; onChange: (v: string) => void; onClose: () => void }) {
 const top = anchor.bottom + 6;
 const left = Math.max(8, Math.min(anchor.left, (typeof window !== "undefined" ? window.innerWidth : 1200) - 232));
 if (typeof document === "undefined") return null;
 return createPortal(
 <>
 <button type="button" aria-label="Close" className="fixed inset-0 z-[68] cursor-default" onClick={(e) => { e.stopPropagation(); onClose(); }} />
 <div style={{ position: "fixed", top, left }} className="z-[70] w-56 rounded-xl border border-black/10 bg-white p-3 shadow-[0_18px_44px_-12px_rgba(43,36,29,0.45)]" onClick={(e) => e.stopPropagation()}>
 <ColorPicker value={value} onChange={onChange} />
 </div>
 </>,
 document.body
 );
}
// A swatch + hex field that opens the visual picker on click.
export function ColorSwatch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
 const [anchor, setAnchor] = useState<DOMRect | null>(null);
 return (
 <div className="flex items-center gap-1.5">
 <button type="button" onClick={(e) => { e.stopPropagation(); setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect()); }} className="h-6 w-6 shrink-0 rounded-md ring-1 ring-black/10 transition hover:ring-black/25" style={{ background: value }} title="Pick a colour" />
 <HexInput value={value} onChange={onChange} className="w-[86px] rounded-md border border-black/10 bg-white px-2 py-1 text-right font-mono text-[11px] uppercase text-stone-600 outline-none focus:border-[#5D0F17]/50" />
 {anchor && <PickerPopover anchor={anchor} value={value} onChange={onChange} onClose={() => setAnchor(null)} />}
 </div>
 );
}
// Compact swatch-only variant for tight floating toolbars — opens the visual picker popover on click.
export function ColorDot({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
 const [anchor, setAnchor] = useState<DOMRect | null>(null);
 return (
 <>
 <button type="button" title={title} onClick={(e) => { e.stopPropagation(); setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect()); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-md ring-1 ring-black/10 transition hover:ring-black/30" style={{ background: value }} />
 {anchor && <PickerPopover anchor={anchor} value={value} onChange={onChange} onClose={() => setAnchor(null)} />}
 </>
 );
}
