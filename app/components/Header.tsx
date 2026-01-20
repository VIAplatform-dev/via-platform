import { getActiveCategories } from "@/app/lib/getActiveCategories";
import HeaderClient from "@/app/components/HeaderClient";

export default function Header() {
  const categories = getActiveCategories();
  return <HeaderClient categories={categories} />;
}
