import Link from "next/link";

type ProductCardProps = {
  name: string;
  price: string;
  category: string;
  storeName: string;
  externalUrl?: string;
  image?: string;
};

export default function ProductCard({
  name,
  price,
  category,
  storeName,
  externalUrl,
  image,
}: ProductCardProps) {
  // If the product has an external URL, we link out.
  // Otherwise this is where an internal route could go later.
  const isExternal = Boolean(externalUrl);

  const CardInner = (
    <>
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-transparent">
  <img
    src={image ?? "/placeholder.jpg"}
    alt={name}
    className="w-full h-full object-cover object-top"
        />
        {!image ? (
          <div className="w-full h-full bg-neutral-200" />
        ) : null}

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
    </>
  );

  // 🔹 External product (Squarespace / Shopify store)
  if (isExternal && externalUrl) {
    return (
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="group cursor-pointer text-black block"
      >
        {CardInner}
      </a>
    );
  }

  // 🔹 Internal product (future-proofing)
  return (
    <Link
      href="#"
      className="group cursor-pointer text-black block"
    >
      {CardInner}
    </Link>
  );
}
