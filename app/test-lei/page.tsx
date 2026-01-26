import { getProductsByStore } from "@/app/lib/db";

export default async function TestLeiPage() {
  const products = await getProductsByStore("lei-vintage");

  return (
    <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
      {products.map((p) => (
        <a
          key={p.id}
          href={p.external_url || "#"}
          target="_blank"
          className="border p-3"
        >
          {p.image && <img src={p.image} alt={p.title} />}
          <p className="mt-2 text-sm">{p.title}</p>
          <p className="text-xs opacity-70">${Number(p.price)}</p>
        </a>
      ))}
    </div>
  );
}
