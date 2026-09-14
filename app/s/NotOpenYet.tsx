/**
 * What a stranger sees at a shop that has not opened yet.
 *
 * It was Next.js's black-on-white "404 This page could not be found" — a developer's error page on
 * a seller's own domain, which says nothing true: the address is right, the shop is real, it just
 * has not opened. And for the seller herself it read as the whole thing being broken.
 *
 * Deliberately no contents: an unpublished shop is not public. The name is already in the address.
 */
export default function NotOpenYet({ name }: { name?: string | null }) {
 return (
  <main
   style={{
    minHeight: "100dvh", display: "grid", placeItems: "center", padding: "32px",
    background: "#FFFDF8", color: "#1c1917",
    fontFamily: "ui-serif, Georgia, 'Times New Roman', serif",
   }}
  >
   <div style={{ maxWidth: "34ch", textAlign: "center" }}>
    <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 500, letterSpacing: "-0.01em" }}>
     {name ? `${name} isn’t open yet` : "This shop isn’t open yet"}
    </h1>
    <p style={{ margin: "14px 0 0", fontSize: "15px", lineHeight: 1.6, color: "#78716c", fontFamily: "system-ui, sans-serif" }}>
     The address is right — there’s just nothing to see here until it opens. Try again soon.
    </p>
   </div>
  </main>
 );
}
