import React, { createContext, useContext, useMemo, useState } from "react";
import type { DraftFields } from "./intake";
import { movePhoto, removePhoto } from "./photo-order";

// The piece being listed right now, held across the two screens of the flow.
//
// Context rather than route params: the photos are local file URIs and the drafted fields are a
// dozen strings, and threading those through Capture → the form as params would serialise them
// into the URL.
//
// IT USED TO BE FOUR SCREENS. Capture → Details → Loading → Review, where Details asked for a
// subset of the fields Review asks for again and Loading was a full page for two HTTP calls. The
// seller's complaint was the obvious one: "it should just be in one place, I shouldn't go to two
// pages." `typed` lived here to carry Details' answers to Loading and went with them.
//
// Deliberately NOT persisted. A half-finished piece belongs in Drafts on the server. That is what
// "Draft" on the Details screen is for, not in a local cache that quietly diverges from it.
//
// IT HAS TO BE EMPTIED BY HAND, and for a long time nothing did it. `reset` ran on a successful
// publish and nowhere else, so ABANDONING a piece left everything here: back into Capture and last
// week's eight photographs were still in the strip. Worse than the clutter, `itemId` survived too,
// which meant the next piece she listed would publish into the PREVIOUS piece's row. Capture's X
// now resets (app/(seller)/list.tsx), which is the exit she actually uses.

type Draft = {
  photos: string[];
  setPhotos: (p: string[]) => void;
  /** Reorder. THE ONLY WAY a photo changes position: `photos` and `imageUrls` are positional and
   *  have to move together, and no screen should have to remember that. */
  movePhoto: (from: number, to: number) => void;
  removePhoto: (index: number) => void;
  /** What came back from /api/store/intake, merged over what she typed. */
  fields: DraftFields;
  setFields: (f: DraftFields) => void;
  /** Fields the model filled but was not confident about. Review marks these "AI unsure. Confirm".
   *  Never includes anything she typed herself: that is hers and is trusted. */
  unsure: string[];
  setUnsure: (f: string[]) => void;
  /** The ones she has since ticked. Keyed by field. */
  confirmed: Record<string, boolean>;
  setConfirmed: (c: Record<string, boolean>) => void;
  /** Collection titles this piece goes into. Titles rather than ids, as the routes take them. */
  collections: string[];
  setCollections: (c: string[]) => void;
  imageUrls: string[];
  setImageUrls: (u: string[]) => void;
  compsCount: number | null;
  setCompsCount: (n: number | null) => void;
  /** Minor units, as the pricing endpoint returns them. Formatted only at the point of display. */
  priceCents: number | null;
  setPriceCents: (n: number | null) => void;
  /**
   * The server-side draft Loading creates the moment pricing returns. It is what makes "you can
   * leave this; it lands in Drafts" true: from here on the piece exists whether or not she ever
   * reaches Review, and Review edits that row instead of creating a second one.
   */
  itemId: string | null;
  setItemId: (id: string | null) => void;
  reset: () => void;
};

const Ctx = createContext<Draft | null>(null);

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [fields, setFields] = useState<DraftFields>({});
  const [unsure, setUnsure] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [collections, setCollections] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [compsCount, setCompsCount] = useState<number | null>(null);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);

  const value = useMemo<Draft>(
    () => ({
      photos, setPhotos, fields, setFields, imageUrls, setImageUrls, compsCount, setCompsCount,
      unsure, setUnsure, confirmed, setConfirmed, collections, setCollections,
      movePhoto: (from, to) => {
        const next = movePhoto({ photos, imageUrls }, from, to);
        setPhotos(next.photos);
        setImageUrls(next.imageUrls);
      },
      removePhoto: (index) => {
        const next = removePhoto({ photos, imageUrls }, index);
        setPhotos(next.photos);
        setImageUrls(next.imageUrls);
      },
      priceCents, setPriceCents, itemId, setItemId,
      reset: () => { setPhotos([]); setFields({}); setImageUrls([]); setCompsCount(null); setPriceCents(null); setItemId(null); setUnsure([]); setConfirmed({}); setCollections([]); },
    }),
    [photos, fields, imageUrls, compsCount, priceCents, itemId, unsure, confirmed, collections],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDraft(): Draft {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDraft must be used inside <DraftProvider>");
  return v;
}
