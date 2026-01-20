export const categoryMap = {
    clothes: "Clothing",
    bags: "Bags",
    shoes: "Shoes",
    accessories: "Accessories",
  } as const;
  
  export type CategorySlug = keyof typeof categoryMap;
  export type CategoryLabel = (typeof categoryMap)[CategorySlug];
  