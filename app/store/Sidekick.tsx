"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X, ArrowUp, SquarePen, Check, ImagePlus } from "lucide-react";
import { RichText, TypingDots } from "./chatRender";

type Action = { name: string; ok: boolean };
type Msg = { role: "user" | "assistant"; content: string; actions?: Action[]; images?: string[] };

const PAGE_LABEL: Record<string, string> = {
 "/store/home": "Home", "/store/intake": "Add listing", "/store/items": "Inventory", "/store/orders": "Orders",
 "/store/inbox": "Inbox", "/store/storefront": "Storefront", "/store/customers": "Customers", "/store/payments": "Payments",
 "/store/dashboard": "Analytics", "/store/settings": "Settings",
 "/admin/home": "Home", "/admin/add-listing": "Add listing", "/admin/inventory": "Inventory",
 "/admin/orders": "Orders", "/admin/inbox": "Inbox", "/admin/storefront": "Storefront",
 "/admin/customers": "Customers", "/admin/payments": "Payments", "/admin/dashboard": "Analytics",
 "/admin/settings": "Settings", "/admin/marketing": "Marketing", "/admin/performance": "Performance",
 "/admin/marketing/campaigns": "Marketing · Campaigns", "/admin/marketing/design": "Marketing · Email design",
 "/admin/connect": "Connect", "/admin/import": "Bring your site", "/admin/ai": "AI accuracy",
};

const WRITE_TOOLS = new Set(["update_storefront_design", "style_storefront", "add_html_section", "set_hero_photo", "update_listing", "add_section", "update_section", "remove_section", "move_section", "set_layout", "create_page", "set_page_layout", "delete_page", "edit_captured_page", "style_captured_site", "update_email_design", "revert_last_change"]);

// Friendly labels for the "what VYA did" chips.
const ACTION_LABELS: Record<string, string> = {
 update_storefront_design: "Updated design", set_hero_photo: "Set hero photo", update_listing: "Updated listing",
 add_section: "Added section", add_html_section: "Built custom section", update_section: "Edited section", remove_section: "Removed section", move_section: "Moved section",
 set_layout: "Rebuilt page", create_page: "Created page", set_page_layout: "Updated page", delete_page: "Deleted page",
 edit_captured_page: "Edited copy", style_captured_site: "Applied styling", style_storefront: "Applied custom CSS", remember_fact: "Remembered", forget_fact: "Forgot",
 update_email_design: "Updated email design", revert_last_change: "Reverted last change",
};

// How tall the composer may grow before it starts scrolling instead. Roughly seven lines — enough to
// hold a paragraph in view, short enough that the message log never gets squeezed out of the panel.
const COMPOSER_MAX_PX = 168;

const SUGGESTIONS = ["Build my whole storefront for me", "Make my storefront more elegant", "Add a sale announcement bar", "Write a description for my Chanel bag"];

// A yes/no question deserves yes/no buttons.
//
// VYA confirms before it changes anything ("Want me to add a reviews section?"), which is right — but
// it means the most common reply in the whole product is the word "yes", typed out.
//
// Finding the question is the whole problem. An earlier pass read only the final LINE, which missed
// every real case: VYA writes "I can make the hero taller.\n\nShall I go ahead?" — where the question
// is the last line — but just as often "Shall I go ahead? Just say the word." or a question closing a
// paragraph. So: locate the last "?", allow a short sign-off after it, and take the sentence that
// ends there.
//
// Deliberately conservative about WHICH questions qualify. An open question — "what should the
// heading say?" — must never get Yes/No buttons, because the buttons would be the wrong reply and the
// merchant would click one anyway.
const YES_NO_OPENERS = /^(?:do|does|did|should|shall|would|will|can|could|may|is|are|was|were|have|has|want|ready|okay|ok|sound|look)\b|(?:want me to|shall i|should i|would you like|do you want|ok(?:ay)? to|sound good|look right|make sense|go ahead|shall we)\b/i;
function isYesNoQuestion(text: string): boolean {
 const t = text.replace(/[*_`>#]/g, "").trim();
 const q = t.lastIndexOf("?");
 if (q === -1) return false;
 // A brief sign-off after the question is fine ("… go ahead? Just say the word."). Anything on a NEW
 // line is not: a question followed by a list of options ("Should I use a grid?\n\n- Grid\n- Rail")
 // is asking you to choose, not to say yes. So a sign-off has to sit on the question's own line.
 const after = t.slice(q + 1);
 if (after.includes("\n") || after.trim().length > 60) return false;
 // The question itself: back to the previous sentence end or line break.
 const before = t.slice(0, q);
 const start = Math.max(before.lastIndexOf("\n"), before.lastIndexOf(". "), before.lastIndexOf("! "), before.lastIndexOf("? "));
 const last = before.slice(start + 1).trim();
 if (!last || last.length > 200) return false;
 // An "or" question ("a grid or a carousel?") takes neither answer.
 if (/\bor\b/i.test(last)) return false;
 // A wh-question is open by definition, whatever it starts with.
 if (/^(?:what|which|who|whom|whose|where|when|why|how)\b/i.test(last)) return false;
 return YES_NO_OPENERS.test(last);
}

function ActionChips({ actions }: { actions?: Action[] }) {
 const chips = (actions ?? []).filter((a) => a.ok && ACTION_LABELS[a.name]);
 if (!chips.length) return null;
 return (
 <div className="mt-2 flex flex-wrap gap-1.5">
 {chips.map((a, i) => (
 <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/[0.08] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-600/15">
 <Check size={10} strokeWidth={3} /> {ACTION_LABELS[a.name]}
 </span>
 ))}
 </div>
 );
}

export default function Sidekick({ docked = false, seed, onSeedUsed }: { docked?: boolean; seed?: string | null; onSeedUsed?: () => void }) {
 const pathname = usePathname();
 const [open, setOpen] = useState(false);
 const [suppressed, setSuppressed] = useState(false); // hide launcher when the home full-page chat is open
 const [msgs, setMsgs] = useState<Msg[]>([]);
 const [input, setInput] = useState("");
 const [attached, setAttached] = useState<string[]>([]); // data-URL inspiration/reference images
 const [busy, setBusy] = useState(false);
 const fileRef = useRef<HTMLInputElement>(null);
 const inputRef = useRef<HTMLTextAreaElement>(null);
 const scroller = useRef<HTMLDivElement>(null);
 const msgsRef = useRef<Msg[]>([]);
 const busyRef = useRef(false);
 const pathRef = useRef(pathname);
 useEffect(() => { pathRef.current = pathname; }, [pathname]);

 useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

 // A one-row textarea doesn't wrap so much as HIDE: a long message scrolls its own single visible
 // line and everything already written disappears upward. So the box grows with the text — up to a
 // point, after which it scrolls rather than swallowing the whole panel. Driven off `input` (not the
 // change handler) so it also collapses back to one row after a send clears the field, and resizes
 // correctly when the composer is seeded from the studio.
 useEffect(() => {
 const el = inputRef.current;
 if (!el) return;
 el.style.height = "0px";
 el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
 }, [input]);

 useEffect(() => {
 fetch("/api/store/assistant").then((r) => (r.ok ? r.json() : null)).then((d) => {
 if (d && Array.isArray(d.messages) && d.messages.length) { msgsRef.current = d.messages; setMsgs(d.messages); }
 }).catch(() => {});
 }, []);

 async function newChat() {
 msgsRef.current = []; setMsgs([]); setInput("");
 await fetch("/api/store/assistant", { method: "DELETE" }).catch(() => {});
 }

 // Turn a data URL ("data:image/png;base64,AAAA") into an Anthropic image block.
 function toImageBlock(url: string) {
 const comma = url.indexOf(",");
 const mediaType = /data:(.*?);base64/.exec(url.slice(0, comma))?.[1] || "image/png";
 return { type: "image", source: { type: "base64", media_type: mediaType, data: url.slice(comma + 1) } };
 }

 function addFiles(files: File[]) {
 files.filter((f) => f.type.startsWith("image/")).slice(0, 4).forEach((f) => {
 if (f.size > 4 * 1024 * 1024) return; // skip images over 4MB
 const reader = new FileReader();
 reader.onload = () => { const url = String(reader.result || ""); if (url.startsWith("data:image/")) setAttached((a) => (a.length >= 4 ? a : [...a, url])); };
 reader.readAsDataURL(f);
 });
 }

 async function send(textArg?: string) {
 const text = (textArg ?? input).trim();
 const imgs = textArg ? [] : attached; // event-triggered sends carry no attachments
 if ((!text && imgs.length === 0) || busyRef.current) return;
 const next: Msg[] = [...msgsRef.current, { role: "user", content: text, ...(imgs.length ? { images: imgs } : {}) }];
 msgsRef.current = next; setMsgs(next); setInput(""); setAttached([]); busyRef.current = true; setBusy(true);
 try {
 const page = PAGE_LABEL[pathRef.current] || undefined;
 // Text turns stay plain strings; image turns become [image blocks…, text] for the vision model.
 const apiMessages = next.map((m) =>
 m.images && m.images.length
 ? { role: m.role, content: [...m.images.map(toImageBlock), ...(m.content ? [{ type: "text", text: m.content }] : [])] }
 : { role: m.role, content: m.content }
 );
 const r = await fetch("/api/store/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: apiMessages, page }) });
 const d = await r.json();
 const reply = !r.ok ? (d.error || "Something went wrong.") : (d.reply || "(done)");
 const after: Msg[] = [...msgsRef.current, { role: "assistant", content: reply, actions: d.actions }];
 msgsRef.current = after; setMsgs(after);
 if (r.ok && (d.actions || []).some((a: Action) => a.ok && WRITE_TOOLS.has(a.name))) window.dispatchEvent(new Event("vya:store-updated"));
 } catch {
 const after: Msg[] = [...msgsRef.current, { role: "assistant", content: "Couldn’t reach me just now — try again." }];
 msgsRef.current = after; setMsgs(after);
 }
 busyRef.current = false; setBusy(false);
 }

 useEffect(() => {
 function onAsk(e: Event) {
 const detail = (e as CustomEvent).detail;
 setOpen(true);
 if (typeof detail === "string" && detail.trim()) send(detail);
 }
 window.addEventListener("vya:ask", onAsk as EventListener);
 return () => window.removeEventListener("vya:ask", onAsk as EventListener);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // PREFILL the composer, rather than send.
 //
 // The studio's per-section VYA button hands its context down as `seed`. It is a PROP and not an
 // event on purpose: the studio mounts this component only while the Assist tab is open, so an event
 // dispatched in the same tick as the tab switch fires before the listener exists and is lost — which
 // is exactly what "the VYA button doesn't connect to anything" was.
 //
 // Seeding never sends. The section is context for a request the merchant hasn't written yet, and
 // firing a bare "About my Hero banner section:" at an assistant that edits the live store would act
 // on nothing anyone asked for. Caret lands at the end, ready to type.
 useEffect(() => {
 if (!seed) return;
 setOpen(true);
 setInput(seed);
 // The parent clears the seed once consumed, so clicking the SAME section twice seeds twice.
 onSeedUsed?.();
 requestAnimationFrame(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [seed]);

 // The home full-page chat signals when it's open so we hide our (redundant) launcher.
 useEffect(() => {
 const onHomeChat = (e: Event) => setSuppressed(!!(e as CustomEvent).detail);
 window.addEventListener("vya:home-chat", onHomeChat as EventListener);
 return () => window.removeEventListener("vya:home-chat", onHomeChat as EventListener);
 }, []);

 return (
 <>
 {/* Launcher */}
 {!docked && !open && !suppressed && (
 <button onClick={() => setOpen(true)} className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#5D0F17] py-2.5 pl-2.5 pr-4 text-[#FFFDF8] shadow-[0_10px_30px_-8px_rgba(93,15,23,0.6)] transition hover:bg-[#4a0c12]">
 <span className="relative grid h-7 w-7 place-items-center rounded-full bg-white/10">
 <Sparkles size={15} />
 <span className="vya-status-dot absolute -right-0 -top-0 h-2 w-2 rounded-full border border-[#5D0F17] bg-emerald-400" />
 </span>
 <span className="font-mono text-[11px] uppercase tracking-[0.18em]">Ask VYA</span>
 </button>
 )}

 {/* Panel */}
 {(open || docked) && (
 <div className={docked ? "flex h-full w-full flex-col overflow-hidden bg-[#FBF9F5]" : "fixed bottom-5 right-5 z-50 flex h-[600px] max-h-[82vh] w-[400px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#FBF9F5] shadow-[0_28px_80px_-24px_rgba(0,0,0,0.5)]"}>
 {/* Header */}
 <div className="flex items-center justify-between border-b border-black/[0.06] bg-gradient-to-br from-[#5D0F17] to-[#3a0a0f] px-4 py-3 text-[#FFFDF8]">
 <div className="flex items-center gap-2.5">
 <span className="relative grid h-8 w-8 place-items-center rounded-lg bg-white/[0.12] ring-1 ring-white/15">
 <Sparkles size={15} />
 <span className="vya-status-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#4a0c12] bg-emerald-400" />
 </span>
 <div>
 <div className="text-[14px] font-semibold leading-tight">VYA</div>
 <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/55">AI Assistant · Online</div>
 </div>
 </div>
 <div className="flex items-center gap-0.5">
 <button onClick={newChat} title="New chat" aria-label="New chat" className="rounded-md p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"><SquarePen size={15} /></button>
 {!docked && <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"><X size={16} /></button>}
 </div>
 </div>

 {/* Log */}
 <div ref={scroller} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
 {msgs.length === 0 && (
 <div className="text-[13px] text-[#5D0F17]/60">
 <p className="mb-3 leading-relaxed">Hi — I run and customize your store with you. I remember our chats. Try:</p>
 <div className="space-y-1.5">
 {SUGGESTIONS.map((s) => (
 <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-[#5D0F17]/12 bg-white px-3 py-2 text-left text-[12.5px] text-[#3a2f28] transition hover:border-[#5D0F17]/30 hover:bg-[#5D0F17]/[0.03]">{s}</button>
 ))}
 </div>
 </div>
 )}
 {msgs.map((m, i) => (
 <div key={i} className={`vya-msg-in flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
 <div className={`max-w-[86%] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${m.role === "user" ? "rounded-2xl rounded-br-md bg-[#5D0F17] text-[#FFFDF8]" : "rounded-2xl rounded-bl-md bg-white text-[#2c241d] ring-1 ring-black/[0.06]"}`}>
 {m.images && m.images.length > 0 && (
 <div className="mb-1.5 flex flex-wrap gap-1.5">
 {m.images.map((src, k) => <img key={k} src={src} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/20" />)}
 </div>
 )}
 {m.role === "assistant" ? <RichText text={m.content} /> : m.content ? <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</span> : null}
 {m.role === "assistant" && <ActionChips actions={m.actions} />}
 {/* Only the LAST message, and only when nothing is in flight — an older question answered out of
     order would attach "Yes" to whatever VYA asked most recently, not to what was clicked. */}
 {m.role === "assistant" && i === msgs.length - 1 && !busy && isYesNoQuestion(m.content) && (
 <div className="mt-2.5 flex gap-1.5">
 <button onClick={() => send("Yes")} className="rounded-full bg-[#5D0F17] px-4 py-1.5 text-[12px] font-semibold text-[#FFFDF8] transition hover:bg-[#4a0c12]">Yes</button>
 <button onClick={() => send("No")} className="rounded-full border border-[#5D0F17]/20 px-4 py-1.5 text-[12px] font-semibold text-[#5D0F17] transition hover:bg-[#5D0F17]/[0.06]">No</button>
 </div>
 )}
 </div>
 </div>
 ))}
 {busy && (
 <div className="vya-msg-in flex justify-start">
 <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 ring-1 ring-black/[0.06]"><TypingDots /></div>
 </div>
 )}
 </div>

 {/* Composer */}
 <div className="border-t border-black/[0.06] bg-[#FBF9F5] p-3">
 {attached.length > 0 && (
 <div className="mb-2 flex flex-wrap gap-1.5">
 {attached.map((src, k) => (
 <div key={k} className="relative">
 <img src={src} alt="" className="h-12 w-12 rounded-lg object-cover ring-1 ring-black/10" />
 <button onClick={() => setAttached((a) => a.filter((_, j) => j !== k))} aria-label="Remove image" className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-[#5D0F17] text-white shadow"><X size={9} strokeWidth={3} /></button>
 </div>
 ))}
 </div>
 )}
 <div className="flex items-end gap-2 rounded-xl border border-[#5D0F17]/15 bg-white px-2 py-2 transition focus-within:border-[#5D0F17]/40 focus-within:ring-2 focus-within:ring-[#5D0F17]/10">
 <button onClick={() => fileRef.current?.click()} disabled={attached.length >= 4} title="Attach an inspiration image" aria-label="Attach image" className="shrink-0 rounded-lg p-1.5 text-[#5D0F17]/50 transition hover:bg-[#5D0F17]/[0.06] hover:text-[#5D0F17] disabled:opacity-30"><ImagePlus size={16} /></button>
 <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
 <textarea
 ref={inputRef}
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
 onPaste={(e) => { const imgs = Array.from(e.clipboardData.items).filter((it) => it.type.startsWith("image/")).map((it) => it.getAsFile()).filter((f): f is File => !!f); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}
 placeholder="Ask, tell me to do something, or paste an image…"
 rows={1}
 className="min-w-0 flex-1 resize-none overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] bg-transparent text-[13.5px] leading-relaxed text-[#2c241d] outline-none placeholder:text-[#5D0F17]/35"
 style={{ maxHeight: COMPOSER_MAX_PX }}
 />
 <button onClick={() => send()} disabled={busy || (!input.trim() && attached.length === 0)} aria-label="Send" className="shrink-0 rounded-lg bg-[#5D0F17] p-1.5 text-[#FFFDF8] transition hover:bg-[#4a0c12] disabled:opacity-40"><ArrowUp size={15} /></button>
 </div>
 <p className="mt-1.5 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-[#5D0F17]/35">Enter to send · attach inspo · VYA confirms before changes</p>
 </div>
 </div>
 )}
 </>
 );
}
