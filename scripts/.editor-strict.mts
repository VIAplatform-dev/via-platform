import { neon } from "@neondatabase/serverless";
import * as cheerio from "cheerio";
import { prepareEditMode } from "../app/lib/site-capture.ts";
const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL!);
const slug = "gianna-marie-raucher";
const pages = await sql`SELECT path, html FROM site_captures WHERE store_slug=${slug} AND html IS NOT NULL` as {path:string;html:string}[];
let loose = 0, cssBg = 0, iframes = 0, videos = 0; const seen = new Set<string>();
const realCopy = (t: string) =>
 t.length > 2 && /[A-Za-z]/.test(t) && /\s|^[A-Za-z'’&.,!?-]+$/.test(t) &&
 !/^[{[]|"version"|rowHtml|itemsPath|^\\n|^[\s\\n]+$/.test(t) && t.split(/\s+/).length <= 20;
for (const p of pages) {
 let prep: string; try { prep = prepareEditMode(p.html, slug, p.path); } catch { continue; }
 const $ = cheerio.load(prep);
 $("*").each((_i, el) => {
  const $el = $(el); if ($el.is("script,style,noscript,svg,template")) return;
  if ($el.children().length === 0) return;
  $el.contents().each((_j, n) => {
   if (n.type !== "text") return;
   const t = String((n as any).data || "").trim();
   if (realCopy(t)) { loose++; seen.add(t.slice(0, 60)); }
  });
 });
 // Hero/section art set from the THEME STYLESHEET rather than inline — the image panel only sees <img>.
 const css = $("style").text();
 cssBg += (css.match(/background-image\s*:\s*url\(/gi) || []).length;
 iframes += $("iframe").length;
 videos += $("video").length;
}
console.log("REAL loose copy (strict): " + loose + " instances, " + seen.size + " distinct");
[...seen].slice(0, 10).forEach(v => console.log("   • " + JSON.stringify(v)));
console.log("\nbackground-image in <style> blocks: " + cssBg);
console.log("iframes: " + iframes + "   <video>: " + videos);
