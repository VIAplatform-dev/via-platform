export const categories = [
    { slug: "clothes", label: "Clothing", image: "/categories/clothes.jpg" },
    { slug: "bags", label: "Bags", image: "/categories/bags.jpg" },
    { slug: "shoes", label: "Shoes", image: "/categories/shoes.jpg" },
    { slug: "accessories", label: "Accessories", image: "/categories/accessories.jpg" },
  ] as const;
  
  export type CategorySlug = typeof categories[number]["slug"];
  