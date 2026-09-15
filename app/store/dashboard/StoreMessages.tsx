"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Conversation = {
 id: number;
 storeSlug: string;
 productId: number | null;
 productTitle: string | null;
 productImage: string | null;
 lastMessageAt: string;
 lastSender: "customer" | "store" | null;
 storeUnread: number;
};

type Message = {
 id: number;
 sender: "customer" | "store";
 body: string;
 createdAt: string;
};

const BURGUNDY = "#5D0F17";

function timeAgo(iso: string): string {
 const d = new Date(iso).getTime();
 const s = Math.floor((Date.now() - d) / 1000);
 if (s < 60) return "just now";
 if (s < 3600) return `${Math.floor(s / 60)}m ago`;
 if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
 return `${Math.floor(s / 86400)}d ago`;
}

export default function StoreMessages({ previewStore }: { previewStore: string | null }) {
 const withStore = useCallback(
 (path: string) =>
 previewStore ? `${path}${path.includes("?") ? "&" : "?"}store=${encodeURIComponent(previewStore)}` : path,
 [previewStore],
 );

 const [conversations, setConversations] = useState<Conversation[]>([]);
 const [loading, setLoading] = useState(true);
 const [activeId, setActiveId] = useState<number | null>(null);
 const [messages, setMessages] = useState<Message[]>([]);
 const [threadLoading, setThreadLoading] = useState(false);
 const [reply, setReply] = useState("");
 const [sending, setSending] = useState(false);
 const threadEndRef = useRef<HTMLDivElement | null>(null);

 const loadConversations = useCallback(async () => {
 try {
 const res = await fetch(withStore("/api/store/messages"));
 if (!res.ok) throw new Error();
 const data = await res.json();
 setConversations(data.conversations ?? []);
 } catch {
 setConversations([]);
 } finally {
 setLoading(false);
 }
 }, [withStore]);

 const openThread = useCallback(
 async (id: number) => {
 setActiveId(id);
 setThreadLoading(true);
 setMessages([]);
 try {
 const res = await fetch(withStore(`/api/store/messages/${id}`));
 if (!res.ok) throw new Error();
 const data = await res.json();
 setMessages(data.messages ?? []);
 // The store just read this thread. Clear its unread badge locally.
 setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, storeUnread: 0 } : c)));
 } catch {
 setMessages([]);
 } finally {
 setThreadLoading(false);
 }
 },
 [withStore],
 );

 useEffect(() => {
 loadConversations();
 }, [loadConversations]);

 useEffect(() => {
 threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
 }, [messages]);

 const sendReply = useCallback(async () => {
 const text = reply.trim();
 if (!text || activeId == null) return;
 setSending(true);
 try {
 const res = await fetch(withStore("/api/store/messages"), {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ conversationId: activeId, body: text }),
 });
 if (!res.ok) throw new Error();
 const data = await res.json();
 setMessages(data.messages ?? []);
 setReply("");
 loadConversations();
 } catch {
 // keep the draft so the store can retry
 } finally {
 setSending(false);
 }
 }, [reply, activeId, withStore, loadConversations]);

 if (loading) {
 return <div className="py-16 text-center text-sm text-[#5D0F17]/50">Loading messages…</div>;
 }

 if (conversations.length === 0) {
 return (
 <div className="py-16 text-center">
 <p className="text-[#5D0F17] text-lg">No messages yet.</p>
 <p className="mt-2 text-sm text-[#5D0F17]/55">
 When a shopper asks a question about one of your pieces, it&rsquo;ll appear here.
 </p>
 </div>
 );
 }

 return (
 <div className="grid gap-4 md:grid-cols-[320px_1fr]">
 {/* Conversation list */}
 <div className="rounded-lg border border-[#5D0F17]/12 overflow-hidden">
 {conversations.map((c) => {
 const active = c.id === activeId;
 return (
 <button
 key={c.id}
 onClick={() => openThread(c.id)}
 className={`flex w-full items-center gap-3 border-b border-[#5D0F17]/8 px-4 py-3 text-left last:border-b-0 ${
 active ? "bg-[#5D0F17]/[0.06]" : "hover:bg-[#5D0F17]/[0.03]"
 }`}
 >
 {c.productImage ? (
 // eslint-disable-next-line @next/next/no-img-element
 <img src={c.productImage} alt="" className="h-12 w-12 flex-shrink-0 object-cover" />
 ) : (
 <div className="h-12 w-12 flex-shrink-0 bg-[#5D0F17]/8" />
 )}
 <div className="min-w-0 flex-1">
 <div className="truncate text-sm text-[#5D0F17]">{c.productTitle ?? "Product question"}</div>
 <div className="text-xs text-[#5D0F17]/45">{timeAgo(c.lastMessageAt)}</div>
 </div>
 {c.storeUnread > 0 && (
 <span
 className="flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] text-[#FFFDF8]"
 style={{ background: BURGUNDY }}
 >
 {c.storeUnread}
 </span>
 )}
 </button>
 );
 })}
 </div>

 {/* Thread */}
 <div className="rounded-lg border border-[#5D0F17]/12 flex flex-col min-h-[420px]">
 {activeId == null ? (
 <div className="flex flex-1 items-center justify-center text-sm text-[#5D0F17]/45">
 Select a conversation to reply.
 </div>
 ) : (
 <>
 <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: 420 }}>
 {threadLoading ? (
 <div className="text-center text-sm text-[#5D0F17]/45">Loading…</div>
 ) : (
 messages.map((m) => (
 <div key={m.id} className={`flex ${m.sender === "store" ? "justify-end" : "justify-start"}`}>
 <div
 className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
 m.sender === "store" ? "text-[#FFFDF8]" : "bg-[#5D0F17]/8 text-[#5D0F17]"
 }`}
 style={m.sender === "store" ? { background: BURGUNDY } : undefined}
 >
 {m.body}
 <div className={`mt-1 text-[10px] ${m.sender === "store" ? "text-[#FFFDF8]/60" : "text-[#5D0F17]/40"}`}>
 {timeAgo(m.createdAt)}
 </div>
 </div>
 </div>
 ))
 )}
 <div ref={threadEndRef} />
 </div>
 <div className="flex items-end gap-2 border-t border-[#5D0F17]/10 p-3">
 <textarea
 value={reply}
 onChange={(e) => setReply(e.target.value)}
 placeholder="Write a reply…"
 rows={2}
 className="flex-1 resize-none rounded-lg border border-[#5D0F17]/20 bg-white px-3 py-2 text-sm text-[#5D0F17] outline-none focus:border-[#5D0F17]/50"
 onKeyDown={(e) => {
 if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
 }}
 />
 <button
 onClick={sendReply}
 disabled={sending || !reply.trim()}
 className="rounded-lg px-4 py-2 text-sm text-[#FFFDF8] disabled:opacity-40"
 style={{ background: BURGUNDY }}
 >
 {sending ? "Sending…" : "Send"}
 </button>
 </div>
 </>
 )}
 </div>
 </div>
 );
}
