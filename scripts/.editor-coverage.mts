/** What the imported-site editor can and cannot reach, measured on real captures. */
import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";
import { prepareEditMode } from "../app/lib/site-capture.ts";

const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const slug = "gianna-marie-raucher";
const pages = await sql`SELECT path, html FROM site_captures WHERE store_slug=${slug} AND html IS NOT NULL ORDER BY path` as {path:string;html:string}[];

const tot: Record<string, number> = {};
const add = (k: string, n = 1) => { tot[k] = (tot[k] || 0) + n; };

for (const p of pages) {
 let prepared: string;
 try { prepared = prepareEditMode(p.html, slug, p.path); } catch { add("PREPARE_FAILED"); continue; }
 const $ = cheerio.load(prepared);
 add("pages");
 add("editable text (data-vya-eid)", $("[data-vya-eid]").length);
 add("images (data-vya-img)", $("[data-vya-img]").length);
 add("links (data-vya-link)", $("[data-vya-link]").length);
 add("sections (data-vya-sec)", $("[data-vya-sec]").length);

 // ---- content a seller can SEE but the editor cannot reach ----
 $("input[placeholder]").each(() => add("UNREACHABLE input placeholder"));
 $("input[value]").each((_i, el) => { const t=($(el).attr("type")||"").toLowerCase(); if (t==="submit"||t==="button") add("UNREACHABLE button value"); });
 $("textarea[placeholder]").each(() => add("UNREACHABLE textarea placeholder"));
 $("option").each((_i, el) => { if ($(el).text().trim()) add("UNREACHABLE <option> label"); });
 $("img[alt]").each((_i, el) => { if (($(el).attr("alt")||"").trim()) add("UNREACHABLE img alt text"); });
 $("[title]").each((_i, el) => { if (($(el).attr("title")||"").trim()) add("UNREACHABLE title attribute"); });
 $("svg text").each(() => add("UNREACHABLE text inside <svg>"));
 $("iframe").each(() => add("UNREACHABLE <iframe> embed"));
 $("video,source[src]").each(() => add("UNREACHABLE video/source"));
 $("[style*='background-image']").each(() => add("UNREACHABLE inline background-image"));
 $("select").each(() => add("UNREACHABLE <select> control"));

 // Text sitting directly inside an element that ALSO has element children: eachEditable requires
 // children().length === 0, so these bare text nodes are skipped entirely.
 $("*").each((_i, el) => {
  const $el = $(el);
  if ($el.is("script,style,noscript,svg")) return;
  if ($el.children().length === 0) return;
  const own = $el.contents().filter((_j, n) => n.type === "text" && String((n as any).data||"").trim().length > 1).length;
  if (own) add("UNREACHABLE loose text beside child tags");
 });
}
const keys = Object.keys(tot).sort((a,b)=> (a.startsWith("UNREACHABLE")===b.startsWith("UNREACHABLE") ? tot[b]-tot[a] : a.startsWith("UNREACHABLE")?1:-1));
for (const k of keys) console.log(String(tot[k]).padStart(6) + "  " + k);
