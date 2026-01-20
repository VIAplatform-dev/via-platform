import axios from "axios";
import { load } from "cheerio";
import fs from "fs";

const SHOP_URL = "https://www.leivintage.com/shop";

async function fetchLeiVintage() {
  const { data: shopHtml } = await axios.get(SHOP_URL);
  const $shop = load(shopHtml);

  const productLinks = new Set<string>();
  console.log("Scanning shop page for links...");

  // 1️⃣ Collect product URLs from shop grid
  $shop("a[href]").each((_, el) => {
    const href = $shop(el).attr("href");

if (
  href &&
  (href.includes("/shop/") || href.includes("/product"))
) {
  productLinks.add(
    href.startsWith("http")
      ? href
      : `https://www.leivintage.com${href}`
  );
}});

console.log("Found product links:", productLinks.size);

  const products: any[] = [];

  // 2️⃣ Visit each product page
  for (const url of productLinks) {
    const { data: productHtml } = await axios.get(url);
    const $ = load(productHtml);

    $("script[type='application/ld+json']").each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || "");
        const items = Array.isArray(json["@graph"])
          ? json["@graph"]
          : [json];

          items.forEach((item: any) => {
          
            if (
              item["@type"] === "Product" ||
              item["@type"] === "ProductGroup"
            ) {          
            products.push({
              store: "LEI Vintage",
              title: item.name,
              price: item.offers?.price,
              currency: item.offers?.priceCurrency,
              image: item.image,
              productUrl: item.url,
            });
          }
        });
      } catch {}
    });
  }

  fs.mkdirSync("./data", { recursive: true });
  fs.writeFileSync(
    "./data/lei-vintage.json",
    JSON.stringify(products, null, 2)
  );

  console.log(`Saved ${products.length} products`);
}

fetchLeiVintage();

