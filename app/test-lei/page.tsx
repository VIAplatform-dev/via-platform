import leiProducts from "@/app/data/lei-vintage.json";

export default function TestLeiPage() {
  return (
    <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-6">
      {leiProducts.map((p: any) => (
        <a
          key={p.productUrl}
          href={p.productUrl}
          target="_blank"
          className="border p-3"
        >
          <img src={p.image} alt={p.title} />
          <p className="mt-2 text-sm">{p.title}</p>
          <p className="text-xs opacity-70">
            ${p.price}
          </p>
        </a>
      ))}
    </div>
  );
}
