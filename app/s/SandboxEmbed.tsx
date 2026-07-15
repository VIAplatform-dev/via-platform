"use client";
import { useEffect, useId, useState } from "react";

// Renders a fully self-contained interactive component (HTML + CSS + JS that VYA or the seller
// authored) inside a SANDBOXED iframe. `sandbox="allow-scripts"` WITHOUT `allow-same-origin` means
// the code runs in a unique opaque origin: it can run JavaScript but cannot read the storefront's
// cookies, localStorage, DOM, or session, and can't navigate the parent — full isolation. This is
// what lets VYA build "anything" (countdowns, calculators, quizzes, filters, canvas animations)
// without that code ever being able to attack the store or its shoppers.
//
// The frame auto-sizes to its content: a tiny bootstrap script inside posts the document height to
// the parent (postMessage works across the isolation boundary), which sets the iframe height.
export default function SandboxEmbed({ html, css, js, vars }: {
 html: string;
 css?: string;
 js?: string;
 vars?: { bg?: string; text?: string; accent?: string; heading?: string; body?: string };
}) {
 const rawId = useId();
 const id = "vyaembed" + rawId.replace(/[^a-zA-Z0-9]/g, "");
 const [height, setHeight] = useState(160);

 useEffect(() => {
 const onMsg = (e: MessageEvent) => {
 const d = e.data;
 if (d && d.vyaEmbed === id && typeof d.height === "number") {
 setHeight(Math.min(6000, Math.max(40, Math.ceil(d.height))));
 }
 };
 window.addEventListener("message", onMsg);
 return () => window.removeEventListener("message", onMsg);
 }, [id]);

 const v = vars || {};
 const rootVars = [
 v.bg && `--bg:${v.bg}`,
 v.text && `--text:${v.text}`,
 v.accent && `--accent:${v.accent}`,
 v.heading && `--heading:${v.heading}`,
 v.body && `--body:${v.body}`,
 ].filter(Boolean).join(";");

 // The bootstrap keeps re-posting height (load, resize, and a couple of delayed ticks) so the parent
 // catches it even if its listener attaches a beat after the frame's first paint.
 const boot = `(function(){function h(){return Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)}function post(){try{parent.postMessage({vyaEmbed:${JSON.stringify(id)},height:h()},'*')}catch(e){}}try{new ResizeObserver(post).observe(document.body)}catch(e){}window.addEventListener('load',post);[80,300,900].forEach(function(t){setTimeout(post,t)});post();})();`;

 const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
 + `<style>:root{${rootVars}}*{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:${v.body || "system-ui,sans-serif"};color:${v.text || "#1a1a1a"};background:transparent;line-height:1.5}${css || ""}</style>`
 + `</head><body>${html || ""}<script>${boot}</${""}script>${js ? `<script>${js}</${""}script>` : ""}</body></html>`;

 return (
 <iframe
 sandbox="allow-scripts allow-popups allow-forms"
 srcDoc={doc}
 title="Custom section"
 loading="lazy"
 className="vya-embed block w-full"
 style={{ height, border: 0, width: "100%", display: "block" }}
 />
 );
}
