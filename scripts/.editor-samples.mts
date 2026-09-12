import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";
import { prepareEditMode } from "../app/lib/site-capture.ts";
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const slug = "gianna-marie-raucher";
const pages = await sql`SELECT path, html FROM site_captures WHERE store_slug=${slug} AND html IS NOT NULL ORDER BY path LIMIT 12` as {path:string;html:string}[];
const ph = new Set<string>(), loose = new Set<string>(), opt = new Set<string>();
for (const p of pages) {
 let prep: string; try { prep = prepareEditMode(p.html, slug, p.path); } catch { continue; }
 const $ = cheerio.load(prep);
 $("input[placeholder],textarea[placeholder]").each((_i, el) => { const v=($(el).attr("placeholder")||"").trim(); if(v) ph.add(v); });
 $("option").each((_i, el) => { const v=$(el).text().trim(); if(v) opt.add(v); });
 $("*").each((_i, el) => {
  const $el=$(el); if ($el.is("script,style,noscript,svg")) return;
  if ($el.children().length === 0) return;
  $el.contents().each((_j, n) => {
   if (n.type!=="text") return; const t=String((n as any).data||"").trim();
   if (t.length>2 && /[a-z]/i.test(t)) loose.add(t.slice(0,70));
  });
 });
}
const show=(label:string,s:Set<string>,n=10)=>{console.log(`\n${label} (${s.size} distinct):`);[...s].slice(0,n).forEach(v=>console.log("   • "+JSON.stringify(v)));};
show("PLACEHOLDERS she cannot edit", ph);
show("LOOSE TEXT she cannot edit", loose, 12);
show("<option> labels she cannot edit", opt, 8);
