// Pure helper: given priced items, find the UNIQUE subset whose prices sum to a
// target total (within ±$1). Used to recover an order's line items from the set
// of items that sold out around the order, but only when there's exactly one
// matching combination, so we never write a guessed line-item list. No imports,
// so it runs under raw `node --test`.

export type PricedItem = { title: string; price: number };
export type MatchedLineItem = { productName: string; quantity: number; price: number };

export function uniqueSubsetForTotal(
 items: PricedItem[],
 targetUsd: number,
 maxSize = 4,
 toleranceUsd = 1,
): MatchedLineItem[] | null {
 const target = Math.round(targetUsd * 100);
 const tol = Math.round(toleranceUsd * 100);
 const arr = items.map((it) => ({ it, cents: Math.round(it.price * 100) }));
 const solutions: PricedItem[][] = [];
 const chosen: Array<{ it: PricedItem; cents: number }> = [];

 const dfs = (start: number, sum: number) => {
 if (solutions.length > 1) return;
 if (chosen.length > 0 && Math.abs(sum - target) <= tol) solutions.push(chosen.map((c) => c.it));
 if (chosen.length >= maxSize) return;
 for (let k = start; k < arr.length; k++) {
 chosen.push(arr[k]);
 dfs(k + 1, sum + arr[k].cents);
 chosen.pop();
 if (solutions.length > 1) return;
 }
 };
 dfs(0, 0);

 if (solutions.length !== 1) return null;
 return solutions[0].map((s) => ({ productName: s.title, quantity: 1, price: s.price }));
}
