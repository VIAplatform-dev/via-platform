import { categories } from "./categories";
import { inventory } from "./inventory";

console.log("INVENTORY LENGTH:", inventory.length);
console.log("INVENTORY CATEGORIES:", inventory.map(i => i.category));

export function getActiveCategories() {
  const activeSlugs = new Set(inventory.map(i => i.category));
  return categories.filter(cat => activeSlugs.has(cat.slug));
}
