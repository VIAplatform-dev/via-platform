"use client";
/* eslint-disable react-hooks/refs -- refs here are read only inside event handlers/effects (deferred), which the rule over-approximates as render-time access. */

import { useEffect, useId, useRef, useState } from "react";
import { Bold, Italic, Heading, List, Link2, Image as ImageIcon, Sparkles } from "lucide-react";

// A true WYSIWYG editor for store emails: bold is bold, headings are headings — the store owner
// never sees markdown symbols. It reads/writes the email body as the same lightweight markdown the
// server renderer + VYA use, so the pipeline is unchanged; the formatting just happens visually.

// ── markdown ⇄ editor-HTML (a small, safe subset: bold, italic, headings, bullets, links) ──
function esc(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function mdInline(s: string): string {
 return esc(s)
 .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
 .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>")
 .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, url) => `<a href="${esc(url)}">${t}</a>`);
}
function mdToHtml(md: string): string {
 const out: string[] = []; let list: string[] = [];
 const flush = () => { if (list.length) { out.push(`<ul>${list.map((li) => `<li>${mdInline(li)}</li>`).join("")}</ul>`); list = []; } };
 for (const line of (md || "").replace(/\r\n/g, "\n").split("\n")) {
 const t = line.trim();
 if (/^##?\s+/.test(t)) { flush(); out.push(`<h2>${mdInline(t.replace(/^##?\s+/, ""))}</h2>`); }
 else if (/^[-*]\s+/.test(t)) { list.push(t.replace(/^[-*]\s+/, "")); }
 else if (t === "") { flush(); out.push("<div><br></div>"); }
 else { flush(); out.push(`<div>${mdInline(line)}</div>`); }
 }
 flush();
 return out.join("") || "<div><br></div>";
}
function nodeToMd(node: Node): string {
 let s = "";
 node.childNodes.forEach((n) => {
 if (n.nodeType === Node.TEXT_NODE) { s += n.textContent || ""; return; }
 const name = n.nodeName;
 if (name === "B" || name === "STRONG") s += `**${nodeToMd(n)}**`;
 else if (name === "I" || name === "EM") s += `*${nodeToMd(n)}*`;
 else if (name === "A") s += `[${nodeToMd(n)}](${(n as HTMLElement).getAttribute("href") || ""})`;
 else if (name === "BR") s += "";
 else s += nodeToMd(n);
 });
 return s;
}
function htmlToMd(root: HTMLElement): string {
 const lines: string[] = [];
 root.childNodes.forEach((node) => {
 const name = node.nodeName;
 if (name === "H1" || name === "H2" || name === "H3") lines.push(`## ${nodeToMd(node).trim()}`);
 else if (name === "UL" || name === "OL") node.childNodes.forEach((li) => { if (li.nodeName === "LI") lines.push(`- ${nodeToMd(li).trim()}`); });
 else if (node.nodeType === Node.TEXT_NODE) lines.push(node.textContent || "");
 else lines.push(nodeToMd(node)); // DIV / P / etc. → one line
 });
 return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export default function EmailEditor({ body, onBody, subject, link, storeName, placeholder }: {
 body: string; onBody: (v: string) => void; subject: string; link: string; storeName?: string; placeholder?: string;
}) {
 const [previewHtml, setPreviewHtml] = useState("");
 const [empty, setEmpty] = useState(!body.trim());
 const [linkOpen, setLinkOpen] = useState(false);
 const [linkUrl, setLinkUrl] = useState("");
 const ref = useRef<HTMLDivElement>(null);
 const fileId = useId();
 const savedRange = useRef<Range | null>(null);
 const lastMd = useRef(body);

 // Render the editor HTML on mount and whenever the body changes from OUTSIDE (e.g. VYA writes the
 // email) — but NOT while the user is typing (sync() keeps lastMd in step, so this is a no-op then,
 // which avoids the caret jumping to the start on every keystroke).
 useEffect(() => {
 if (!ref.current) return;
 if (body !== lastMd.current || ref.current.innerHTML === "") {
 ref.current.innerHTML = mdToHtml(body);
 lastMd.current = body;
 setEmpty(!body.trim());
 }
 }, [body]);

 function sync() {
 if (!ref.current) return;
 const md = htmlToMd(ref.current);
 lastMd.current = md; setEmpty(!md.trim()); onBody(md);
 }

 // Live preview through the real server renderer, so it's exactly what sends (and branded).
 useEffect(() => {
 const id = setTimeout(() => {
 fetch("/api/store/email-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, link }) })
 .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.html) setPreviewHtml(d.html); }).catch(() => {});
 }, 350);
 return () => clearTimeout(id);
 }, [body, link]);

 const exec = (cmd: string, val?: string) => { ref.current?.focus(); document.execCommand(cmd, false, val); sync(); };
 function toggleHeading() {
 ref.current?.focus();
 const cur = (document.queryCommandValue("formatBlock") || "").toLowerCase();
 document.execCommand("formatBlock", false, cur === "h2" ? "div" : "h2");
 sync();
 }
 function openLink() {
 const sel = window.getSelection();
 if (sel && sel.rangeCount) savedRange.current = sel.getRangeAt(0).cloneRange();
 setLinkUrl(""); setLinkOpen(true);
 }
 function applyLink() {
 const url = linkUrl.trim();
 setLinkOpen(false);
 if (!url) return;
 ref.current?.focus();
 if (savedRange.current) { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(savedRange.current); }
 document.execCommand("createLink", false, /^https?:\/\//i.test(url) ? url : `https://${url}`);
 sync();
 }
 async function uploadImage(file: File) {
 const fd = new FormData(); fd.append("file", file);
 try { const r = await fetch("/api/store/assets", { method: "POST", body: fd }); if (r.ok) { const { url } = await r.json(); if (url) { ref.current?.focus(); document.execCommand("insertImage", false, url); sync(); } } } catch { /* ignore */ }
 }

 const tools: { icon: typeof Bold; label: string; run: () => void }[] = [
 { icon: Heading, label: "Heading", run: toggleHeading },
 { icon: Bold, label: "Bold", run: () => exec("bold") },
 { icon: Italic, label: "Italic", run: () => exec("italic") },
 { icon: List, label: "Bullet list", run: () => exec("insertUnorderedList") },
 { icon: Link2, label: "Link", run: openLink },
 ];

 return (
 <div className="grid gap-4 md:grid-cols-2">
 <div>
 <div className="overflow-hidden rounded-lg border border-stone-200 focus-within:border-[var(--accent,#5D0F17)]">
 <div className="flex items-center gap-0.5 border-b border-stone-100 bg-stone-50/70 px-1.5 py-1">
 {tools.map((t) => (
 <button key={t.label} type="button" title={t.label} onMouseDown={(e) => e.preventDefault()} onClick={t.run}
 className="flex h-7 w-7 items-center justify-center rounded-md text-stone-500 transition hover:bg-white hover:text-stone-900">
 <t.icon size={14} />
 </button>
 ))}
 <label title="Add image" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-stone-500 transition hover:bg-white hover:text-stone-900" onMouseDown={(e) => e.preventDefault()}>
 <ImageIcon size={14} />
 <input id={fileId} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) uploadImage(e.target.files[0]); e.target.value = ""; }} />
 </label>
 </div>
 {linkOpen && (
 <div className="flex items-center gap-2 border-b border-stone-100 bg-white px-2 py-1.5">
 <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } if (e.key === "Escape") setLinkOpen(false); }} placeholder="Paste a link (https://…)" className="flex-1 rounded-md border border-stone-200 px-2 py-1 text-[12px] outline-none focus:border-[var(--accent,#5D0F17)]" />
 <button type="button" onClick={applyLink} className="rounded-md bg-[var(--accent,#5D0F17)] px-2.5 py-1 text-[12px] font-medium text-white">Add</button>
 <button type="button" onClick={() => setLinkOpen(false)} className="text-[12px] text-stone-400 hover:text-stone-600">Cancel</button>
 </div>
 )}
 <div className="relative">
 <div
 ref={ref}
 contentEditable
 suppressContentEditableWarning
 onInput={sync}
 className="min-h-[16rem] w-full px-3.5 py-3 text-[14px] leading-relaxed text-stone-900 outline-none [&_a]:text-[var(--accent,#5D0F17)] [&_a]:underline [&_h2]:mb-1 [&_h2]:mt-2 [&_h2]:text-[18px] [&_h2]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-md [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5"
 />
 {empty && <div className="pointer-events-none absolute left-3.5 top-3 text-[14px] leading-relaxed text-stone-400">{placeholder || "Write like you're talking to a customer…"}</div>}
 </div>
 </div>
 <p className="mt-1.5 text-[11px] text-stone-400">Type normally, then select text and use the toolbar to make it <b>bold</b>, a heading, or a list — or ask VYA to write it for you.</p>
 </div>

 <div>
 <div className="mb-1.5 flex items-center justify-between gap-2">
 <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-stone-400">Preview</p>
 <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft,rgba(93,15,23,0.06))] px-2 py-0.5 text-[10px] font-medium text-[var(--accent,#5D0F17)]"><Sparkles size={10} strokeWidth={2.25} /> Styled with your store’s brand</span>
 </div>
 <div className="overflow-hidden rounded-xl border border-stone-200/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
 <div className="border-b border-stone-100 px-4 py-2.5">
 <p className="truncate text-[13px] font-semibold text-stone-900">{subject || <span className="text-stone-400">Your subject line</span>}</p>
 <p className="mt-0.5 truncate text-[11px] text-stone-400">From {storeName || "your store"}</p>
 </div>
 <iframe srcDoc={previewHtml} title="Email preview" className="h-[440px] w-full border-0 bg-[#f1efeb]" sandbox="" />
 </div>
 </div>
 </div>
 );
}
