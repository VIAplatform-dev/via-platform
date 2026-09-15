import type { CSSProperties } from "react";
import { policyLabel, type PolicySlug } from "@/app/lib/policy-pages";

// A store's own policy, on her own storefront, in her own type.
//
// Deliberately plain. This is the page a shopper opens to find out whether she can send something
// back, and the answer is the only thing on it: her nav above so she can get back to the shop, her
// words, and nothing else competing for the eye. The heading is the policy's name rather than a
// title she has to write, because "Returns" is what a shopper is looking for in a footer.

export default function PolicyPage({
 slug, paragraphs, storeName, enabled, nav, home, theme,
}: {
 slug: PolicySlug;
 paragraphs: string[];
 storeName: string;
 enabled: boolean;
 nav: Array<{ label: string; href: string }>;
 home: string;
 theme: { bg: string; text: string; headingFont?: string; bodyFont?: string; fontsHref: string | null };
}) {
 const vars: Record<string, string> = {};
 if (theme.headingFont) vars["--font-heading"] = `'${theme.headingFont}', Georgia, serif`;
 if (theme.bodyFont) vars["--font-body"] = `'${theme.bodyFont}', system-ui, sans-serif`;
 const rootStyle = {
  ...vars, background: theme.bg, color: theme.text,
  ...(theme.bodyFont ? { fontFamily: "var(--font-body)" } : {}),
 } as CSSProperties;
 const headingStyle = theme.headingFont ? { fontFamily: "var(--font-heading)" } : undefined;

 return (
  <main style={rootStyle} className="min-h-screen">
   {theme.fontsHref && <link rel="stylesheet" href={theme.fontsHref} />}
   {!enabled && (
    <div className="bg-[#5D0F17] py-1.5 text-center text-[11px] uppercase tracking-[0.2em] text-white">Preview · not live yet</div>
   )}

   <nav className="flex items-center justify-between border-b border-black/10 px-6 py-4">
    <a href={home} className="text-base tracking-wide" style={headingStyle}>{storeName}</a>
    <div className="flex items-center gap-6 text-[11px] uppercase tracking-[0.16em] opacity-70">
     {nav.map((n, i) => <a key={i} href={n.href} className="hover:opacity-100">{n.label}</a>)}
    </div>
   </nav>

   <section className="mx-auto max-w-2xl px-6 py-16 sm:py-20">
    <h1 className="text-3xl sm:text-4xl" style={headingStyle}>{policyLabel(slug)}</h1>
    <div className="mt-8">
     {/* whitespace-pre-line, because a single newline inside a paragraph is a line she meant to
         break: an address, a list of conditions. The blank lines between paragraphs are the gaps. */}
     {paragraphs.map((p, i) => (
      <p key={i} className="mt-4 whitespace-pre-line text-[15px] leading-[1.8] opacity-80">{p}</p>
     ))}
    </div>
   </section>
  </main>
 );
}
