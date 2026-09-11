export const dynamic = "force-dynamic";

export default function CheckoutCancel() {
 return (
 <main className="min-h-screen bg-[#FFFDF8] text-[#241c17] flex items-center justify-center px-6">
 <div className="text-center max-w-md">
 <p className="font-serif text-2xl sm:text-3xl mb-3">Checkout canceled</p>
 <p className="text-sm text-black/55">No charge was made. The piece is still available, head back and try again whenever you’re ready.</p>
 </div>
 </main>
 );
}
