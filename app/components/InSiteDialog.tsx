"use client";

// In-site replacements for window.confirm / window.alert / window.prompt.
//
// The browser's own boxes ("localhost:3333 says — Delete this page?") look like a crash, can't be
// styled, block every other tab event, and on the phone app's web views don't appear at all. This
// gives an editor one hook with the same three verbs, each returning a promise so a call site reads
// exactly like the native one did — `if (!(await dialog.confirm(...))) return;` — and one node to
// render anywhere in its tree (it portals to <body>, so placement is irrelevant).
//
// Styling matches ConfirmDialog in app/infrastructure/admin/ui.tsx (wine primary, rounded card) so
// the workspace and the editors share one look, without that component's controlled open/close API.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Tone = "danger" | "primary";
export type ConfirmOptions = { title: string; body?: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: Tone };
export type AlertOptions = { title: string; body?: React.ReactNode; okLabel?: string };
export type PromptOptions = { title: string; body?: React.ReactNode; placeholder?: string; defaultValue?: string; confirmLabel?: string; cancelLabel?: string; maxLength?: number };

type Request =
 | ({ kind: "confirm"; resolve: (ok: boolean) => void } & ConfirmOptions)
 | ({ kind: "alert"; resolve: () => void } & AlertOptions)
 | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

export function useInSiteDialog() {
 const [req, setReq] = useState<Request | null>(null);
 const confirm = useCallback((o: ConfirmOptions | string) => new Promise<boolean>((resolve) => setReq({ kind: "confirm", resolve, ...(typeof o === "string" ? { title: o } : o) })), []);
 const alert = useCallback((o: AlertOptions | string) => new Promise<void>((resolve) => setReq({ kind: "alert", resolve, ...(typeof o === "string" ? { title: o } : o) })), []);
 const prompt = useCallback((o: PromptOptions | string) => new Promise<string | null>((resolve) => setReq({ kind: "prompt", resolve, ...(typeof o === "string" ? { title: o } : o) })), []);
 const node = req ? <DialogView req={req} done={() => setReq(null)} /> : null;
 return { confirm, alert, prompt, node };
}

const BTN = "min-h-[44px] flex-1 rounded-xl text-[14px] font-semibold transition disabled:opacity-60";
const CANCEL = `${BTN} border border-stone-200 bg-white text-stone-700 hover:bg-stone-50`;
const TONE: Record<Tone, string> = { danger: `${BTN} bg-[#5D0F17] text-white hover:bg-[#4a0c12]`, primary: `${BTN} bg-stone-900 text-white hover:bg-stone-800` };

function DialogView({ req, done }: { req: Request; done: () => void }) {
 const [value, setValue] = useState(req.kind === "prompt" ? (req.defaultValue ?? "") : "");
 const inputRef = useRef<HTMLInputElement>(null);
 // Cancel resolves the way the native box does: confirm → false, prompt → null, alert → undefined.
 const cancel = useCallback(() => {
  if (req.kind === "confirm") req.resolve(false);
  else if (req.kind === "prompt") req.resolve(null);
  else req.resolve();
  done();
 }, [req, done]);
 const accept = () => {
  if (req.kind === "confirm") req.resolve(true);
  else if (req.kind === "prompt") req.resolve(value);
  else req.resolve();
  done();
 };
 useEffect(() => {
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
  window.addEventListener("keydown", onKey);
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  inputRef.current?.select();
  return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
 }, [cancel]);
 if (typeof document === "undefined") return null;
 const cancelLabel = req.kind === "alert" ? null : (req.cancelLabel ?? "Cancel");
 const okLabel = req.kind === "alert" ? (req.okLabel ?? "OK") : req.kind === "prompt" ? (req.confirmLabel ?? "Add") : (req.confirmLabel ?? "OK");
 const tone: Tone = req.kind === "confirm" ? (req.tone ?? "danger") : "primary";
 const okDisabled = req.kind === "prompt" && !value.trim();
 return createPortal(
  <div role="dialog" aria-modal="true" aria-label={req.title} onClick={cancel}
   className="fixed inset-0 z-[300] flex items-end justify-center bg-stone-900/40 p-4 backdrop-blur-[2px] sm:items-center">
   <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!okDisabled) accept(); }}
    className="w-full max-w-[420px] rounded-3xl border border-stone-200 bg-white p-5 text-left shadow-[0_24px_60px_-20px_rgba(16,24,40,.45)]">
    <h2 className="text-[17px] font-semibold tracking-tight text-stone-900">{req.title}</h2>
    {req.body && <div className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-stone-500">{req.body}</div>}
    {req.kind === "prompt" && (
     <input ref={inputRef} autoFocus value={value} maxLength={req.maxLength ?? 60} placeholder={req.placeholder} onChange={(e) => setValue(e.target.value)}
      className="mt-3.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[14px] text-stone-800 outline-none focus:border-[#5D0F17]/50" />
    )}
    <div className="mt-5 flex gap-2">
     {cancelLabel && <button type="button" onClick={cancel} className={CANCEL}>{cancelLabel}</button>}
     <button type="submit" autoFocus={req.kind !== "prompt"} disabled={okDisabled} className={TONE[tone]}>{okLabel}</button>
    </div>
   </form>
  </div>,
  document.body,
 );
}
