import React from "react";

// Lightweight, dependency-free rich-text for AI chat replies. Renders as React nodes (never raw
// HTML), so it's XSS-safe by construction. Handles the markdown Claude actually emits: code fences,
// inline `code`, **bold**, *italic*, [links](url), and - / 1. lists.

function inline(text: string, keyBase: string): React.ReactNode[] {
 const out: React.ReactNode[] = [];
 const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;
 let last = 0;
 let m: RegExpExecArray | null;
 let i = 0;
 while ((m = re.exec(text)) !== null) {
 if (m.index > last) out.push(text.slice(last, m.index));
 const tok = m[0];
 const key = `${keyBase}-${i++}`;
 if (tok.startsWith("`")) {
 out.push(<code key={key} className="rounded bg-black/[0.06] px-1 py-0.5 font-mono text-[0.85em] text-[#5D0F17]">{tok.slice(1, -1)}</code>);
 } else if (tok.startsWith("**")) {
 out.push(<strong key={key} className="font-semibold">{tok.slice(2, -2)}</strong>);
 } else if (tok.startsWith("*")) {
 out.push(<em key={key}>{tok.slice(1, -1)}</em>);
 } else {
 const mm = tok.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
 if (mm) out.push(<a key={key} href={mm[2]} target="_blank" rel="noopener noreferrer" className="underline decoration-[#5D0F17]/40 underline-offset-2 hover:decoration-[#5D0F17]">{mm[1]}</a>);
 else out.push(tok);
 }
 last = re.lastIndex;
 }
 if (last < text.length) out.push(text.slice(last));
 return out;
}

export function RichText({ text }: { text: string }) {
 // Split on code fences. Odd segments are code blocks.
 const segments = text.split(/```/);
 return (
 <>
 {segments.map((seg, si) => {
 if (si % 2 === 1) {
 const code = seg.replace(/^[a-zA-Z0-9_-]*\n/, "").replace(/\n$/, "");
 return (
 <pre key={si} className="my-2 overflow-x-auto rounded-lg bg-[#1c1917] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-stone-100">
 <code>{code}</code>
 </pre>
 );
 }
 // Group lines into paragraphs and lists.
 const lines = seg.split("\n");
 const blocks: React.ReactNode[] = [];
 let list: { ordered: boolean; items: string[] } | null = null;
 let para: string[] = [];
 const flushPara = (k: string) => { if (para.length) { blocks.push(<p key={k} className="whitespace-pre-wrap">{inline(para.join("\n"), k)}</p>); para = []; } };
 const flushList = (k: string) => {
 if (list) {
 const L = list;
 const Tag = (L.ordered ? "ol" : "ul") as "ol" | "ul";
 blocks.push(<Tag key={k} className={`my-1.5 space-y-1 pl-4 ${L.ordered ? "list-decimal" : "list-disc"} marker:text-[#5D0F17]/40`}>{L.items.map((it, ii) => <li key={ii} className="pl-0.5">{inline(it, `${k}-${ii}`)}</li>)}</Tag>);
 list = null;
 }
 };
 lines.forEach((line, li) => {
 const bullet = line.match(/^\s*[-*]\s+(.*)$/);
 const num = line.match(/^\s*\d+\.\s+(.*)$/);
 if (bullet) { flushPara(`p${si}-${li}`); if (!list || list.ordered) { flushList(`l${si}-${li}`); list = { ordered: false, items: [] }; } list.items.push(bullet[1]); }
 else if (num) { flushPara(`p${si}-${li}`); if (!list || !list.ordered) { flushList(`l${si}-${li}`); list = { ordered: true, items: [] }; } list.items.push(num[1]); }
 else if (line.trim() === "") { flushPara(`p${si}-${li}`); flushList(`l${si}-${li}`); }
 else { flushList(`l${si}-${li}`); para.push(line); }
 });
 flushPara(`p${si}-end`); flushList(`l${si}-end`);
 return <div key={si} className="space-y-2">{blocks}</div>;
 })}
 </>
 );
}

// Sleek three-dot "thinking" indicator.
export function TypingDots() {
 return (
 <span className="inline-flex items-center gap-1">
 {[0, 1, 2].map((i) => (
 <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#5D0F17]/50" style={{ animation: `vyaBlink 1.2s ease-in-out ${i * 0.18}s infinite` }} />
 ))}
 </span>
 );
}
