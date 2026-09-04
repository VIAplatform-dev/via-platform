import React, { createContext, useContext, useMemo, useState } from "react";
import type { DraftFields } from "./intake";

// The piece being listed right now, held across the four screens of the flow.
//
// Context rather than route params: the photos are local file URIs and the drafted fields are a
// dozen strings, and threading those through Capture → Details → Loading → Review as params would
// serialise them into the URL. It is also the thing that has to survive her backing up one screen
// to fix a brand, which is the single most likely detour in this flow.
//
// Deliberately NOT persisted. A half-finished piece belongs in Drafts on the server — that is what
// "Draft" on the Details screen is for — not in a local cache that quietly diverges from it.

type Draft = {
  photos: string[];
  setPhotos: (p: string[]) => void;
  /** What SHE typed. Authoritative — the AI only fills what is missing from this. */
  typed: Record<string, string>;
  setTyped: (t: Record<string, string>) => void;
  /** What came back from /api/store/intake, merged over what she typed. */
  fields: DraftFields;
  setFields: (f: DraftFields) => void;
  imageUrls: string[];
  setImageUrls: (u: string[]) => void;
  compsCount: number | null;
  setCompsCount: (n: number | null) => void;
  reset: () => void;
};

const Ctx = createContext<Draft | null>(null);

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<DraftFields>({});
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [compsCount, setCompsCount] = useState<number | null>(null);

  const value = useMemo<Draft>(
    () => ({
      photos, setPhotos, typed, setTyped, fields, setFields, imageUrls, setImageUrls, compsCount, setCompsCount,
      reset: () => { setPhotos([]); setTyped({}); setFields({}); setImageUrls([]); setCompsCount(null); },
    }),
    [photos, typed, fields, imageUrls, compsCount],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDraft(): Draft {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDraft must be used inside <DraftProvider>");
  return v;
}
