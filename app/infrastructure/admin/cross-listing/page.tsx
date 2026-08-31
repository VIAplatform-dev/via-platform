import CrossListingView from "./CrossListingView";

// Cross-listing → Listings (what needs listing where). Analytics lives at ./analytics; connecting
// accounts lives at ./settings (Marketplaces).
export default function CrossListingListingsPage() {
 return <CrossListingView view="listings" />;
}
