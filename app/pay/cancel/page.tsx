export default function PayCancel() {
 return (
 <main className="flex min-h-screen items-center justify-center bg-[#f7f6f3] px-6 text-center" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
 <div>
 <h1 className="text-2xl font-semibold text-stone-900">Payment not completed</h1>
 <p className="mt-2 text-[15px] text-stone-600">Nothing was charged. Scan the seller’s code again to try another way to pay.</p>
 </div>
 </main>
 );
}
