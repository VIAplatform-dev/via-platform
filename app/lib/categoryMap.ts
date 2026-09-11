// Fine-grained product categories (assigned by inferCategoryFromTitle)
export const categoryMap = {
 // Clothing
 tops: "Tops",
 sweaters: "Sweaters",
 "coats-jackets": "Coats & Jackets",
 pants: "Pants",
 jeans: "Jeans",
 dresses: "Dresses",
 skirts: "Skirts",
 shorts: "Shorts",
 jumpsuits: "Jumpsuits",
 lingerie: "Lingerie",
 swimwear: "Swimwear",
 "other-clothing": "Clothing",
 // Shoes
 shoes: "Shoes",
 boots: "Boots",
 heels: "Heels",
 sneakers: "Sneakers",
 sandals: "Sandals",
 flats: "Flats",
 // Bags
 bags: "Bags",
 totes: "Totes",
 clutches: "Clutches",
 "crossbody-bags": "Crossbody",
 handbags: "Handbags",
 wallets: "Wallets",
 // Accessories
 accessories: "Accessories",
 jewelry: "Jewelry",
 belts: "Belts",
 scarves: "Scarves",
 hats: "Hats",
 sunglasses: "Sunglasses",
 // Home
 home: "Home",
} as const;

export type CategorySlug = keyof typeof categoryMap;
export type CategoryLabel = (typeof categoryMap)[CategorySlug];

// Slugs that fall under the "Clothing" display category
// Note: "other-clothing" is intentionally excluded — items that don't match
// a specific clothing keyword should not pollute the clothing category page.
export const clothingSlugs = new Set<CategorySlug>([
 "tops", "sweaters", "coats-jackets", "pants", "jeans",
 "dresses", "skirts", "shorts", "jumpsuits", "lingerie", "swimwear",
]);

// Slugs that fall under the "Shoes" display category (includes legacy "shoes" catch-all)
export const shoesSlugs = new Set<CategorySlug>([
 "shoes", "boots", "heels", "sneakers", "sandals", "flats",
]);

// Slugs that fall under the "Bags" display category (includes legacy "bags" catch-all)
export const bagsSlugs = new Set<CategorySlug>([
 "bags", "totes", "clutches", "crossbody-bags", "handbags", "wallets",
]);

// Slugs that fall under the "Accessories" display category (includes legacy "accessories" catch-all)
export const accessoriesSlugs = new Set<CategorySlug>([
 "accessories", "jewelry", "belts", "scarves", "hats", "sunglasses",
]);

// The top-level display categories (homepage, header, nav)
export const displayCategories = [
 { slug: "clothing", label: "Clothing", image: "/categories/clothes.jpg" },
 { slug: "bags", label: "Bags", image: "/categories/bags.jpg" },
 { slug: "shoes", label: "Shoes", image: "/categories/shoes.jpg" },
 { slug: "accessories", label: "Accessories", image: "/categories/accessories.jpg" },
 { slug: "home", label: "Home", image: "/categories/home.jpg" },
] as const;

export type DisplayCategorySlug = (typeof displayCategories)[number]["slug"];

// Nav hierarchy for the categories mega-menu
export const navCategoryGroups = [
 {
 slug: "clothing",
 label: "Clothing",
 subs: [
 { slug: "tops", label: "Tops" },
 { slug: "sweaters", label: "Sweaters" },
 { slug: "coats-jackets", label: "Coats & Jackets" },
 { slug: "pants", label: "Pants" },
 { slug: "jeans", label: "Jeans" },
 { slug: "dresses", label: "Dresses" },
 { slug: "skirts", label: "Skirts" },
 { slug: "shorts", label: "Shorts" },
 { slug: "jumpsuits", label: "Jumpsuits" },
 ],
 },
 {
 slug: "shoes",
 label: "Shoes",
 subs: [
 { slug: "boots", label: "Boots" },
 { slug: "heels", label: "Heels" },
 { slug: "sneakers", label: "Sneakers" },
 { slug: "sandals", label: "Sandals" },
 { slug: "flats", label: "Flats" },
 ],
 },
 {
 slug: "bags",
 label: "Bags",
 subs: [
 { slug: "handbags", label: "Handbags" },
 { slug: "totes", label: "Totes" },
 { slug: "clutches", label: "Clutches" },
 { slug: "crossbody-bags", label: "Crossbody" },
 { slug: "wallets", label: "Wallets" },
 ],
 },
 {
 slug: "accessories",
 label: "Accessories",
 subs: [
 { slug: "jewelry", label: "Jewelry" },
 { slug: "belts", label: "Belts" },
 { slug: "scarves", label: "Scarves" },
 { slug: "hats", label: "Hats" },
 { slug: "sunglasses", label: "Sunglasses" },
 ],
 },
 {
 slug: "home",
 label: "Home",
 subs: [],
 },
] as const;
