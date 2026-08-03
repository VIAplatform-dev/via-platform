// Homepage "Styling Guide" — shoppable looks. Each look is an editorial photo
// (in /public/styling-guide/ or /public/y2k-edit/) plus the pieces in it, linked
// to their product pages. Add more looks here and they'll render automatically.
// Product links are validated against the live catalog; dead (sold/removed) items
// are pruned so nothing on the homepage points to a 404.

export type StylingLookItem = { label: string; url: string };

export type StylingLook = {
 /** Image under /public (e.g. /styling-guide/post-121.jpg). */
 image: string;
 /** Optional caption shown under the look. */
 caption?: string;
 /** Shoppable pieces in the look. */
 items: StylingLookItem[];
};

export const STYLING_LOOKS: StylingLook[] = [
 {
 image: "/styling-guide/post-121.jpg",
 items: [
 { label: "Blouse", url: "/products/mookie-studios-3780080" },
 { label: "Skirt", url: "/products/sheer-vintage-1659282" },
 { label: "Bag", url: "/products/hachi-archive-3415148" },
 { label: "Heels", url: "/products/hachi-archive-1683463" },
 ],
 },
 {
 image: "/styling-guide/post-122.jpg",
 items: [
 { label: "Dress", url: "/products/mookie-studios-3708419" },
 { label: "Sunglasses", url: "/products/lamash-2777995" },
 { label: "Bag", url: "/products/hachi-archive-2559661" },
 { label: "Heels", url: "/products/sassy-so-what-3705371" },
 ],
 },
 {
 image: "/styling-guide/post-123.jpg",
 items: [
 { label: "Top", url: "/products/mookie-studios-3708416" },
 { label: "Skirt", url: "/products/mookie-studios-3708421" },
 { label: "Bag", url: "/products/capsule-edit-3304433" },
 ],
 },
 {
 image: "/styling-guide/post-124.jpg",
 items: [
 { label: "Dress", url: "/products/edited-archive-1397713" },
 { label: "Bag", url: "/products/petria-vintage-3709656" },
 { label: "Heels", url: "/products/hachi-archive-3415132" },
 ],
 },
 {
 image: "/styling-guide/post-125.jpg",
 items: [
 { label: "Top", url: "/products/reine-revival-3382490" },
 { label: "Jeans", url: "/products/lover-girl-vintage-145702" },
 { label: "Bag", url: "/products/california-boho-studio-2002740" },
 { label: "Heels", url: "/products/scarz-vintage-260" },
 ],
 },
 {
 image: "/styling-guide/post-126.jpg",
 items: [
 { label: "Cami", url: "/products/lover-girl-vintage-3400940" },
 { label: "Skirt", url: "/products/sourced-by-scottie-2622158" },
 { label: "Heels", url: "/products/hachi-archive-1683476" },
 ],
 },
 {
 image: "/y2k-edit/look-5.jpg",
 items: [
 { label: "Top", url: "/products/mookie-studios-1895099" },
 { label: "Jeans", url: "/products/sourced-by-scottie-1987435" },
 { label: "Bag", url: "/products/promised-vintage-91691" },
 ],
 },
 {
 image: "/styling-guide/post-56.jpg",
 items: [
 { label: "Dress", url: "/products/blodas-choice-1858323" },
 { label: "Purse", url: "/products/tess-elizabeth-vintage-695266" },
 ],
 },
 {
 image: "/styling-guide/post-57.jpg",
 items: [
 { label: "Top", url: "/products/maison-optimism-vintage-1763189" },
 { label: "Skirt", url: "/products/edited-archive-1655057" },
 ],
 },
 {
 image: "/styling-guide/post-58.jpg",
 items: [
 { label: "Bag", url: "/products/montrose-edit-1700647" },
 { label: "Pants", url: "/products/sourced-by-scottie-2494559" },
 { label: "Shoes", url: "/products/sheer-vintage-1858608" },
 ],
 },
 {
 image: "/styling-guide/post-59.jpg",
 items: [
 { label: "Top", url: "/products/mookie-studios-1895087" },
 { label: "Wallet", url: "/products/hachi-archive-1683444" },
 { label: "Shoes", url: "/products/vintage-girlfriend-86350" },
 { label: "Pants", url: "/products/ascensio-vintage-1898266" },
 { label: "Earrings", url: "/products/blodas-choice-23607" },
 ],
 },
];
