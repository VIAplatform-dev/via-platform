import Link from "next/link";

type ProductCardProps = {
  name: string;
  price: string;
  category: string;
  storeName: string;
  storeSlug: string;
  externalId: string;
};

export default function ProductCard({
  name,
  price,
  category,
  storeName,
  storeSlug,
  externalId,
}: ProductCardProps) {
  return (
    <Link
      href={`/out/${storeSlug}/${externalId}`}
      className="group cursor-pointer text-black block"
    >
      <div className="aspect-[3/4] bg-neutral-200 mb-4 overflow-hidden relative border border-black transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.01]">
        <div className="absolute inset-0 bg-black/5 group-hover:bg-black/10 transition" />
      </div>

      <p className="text-xs uppercase tracking-wide text-black/60 mb-1">
        {storeName}
      </p>

      <h3 className="font-serif text-lg text-black leading-snug">
        {name}
      </h3>

      <p className="text-sm text-black/70">
        {category}
      </p>

      <p className="text-sm mt-1 text-black">
        {price}
      </p>
    </Link>
  );
}
