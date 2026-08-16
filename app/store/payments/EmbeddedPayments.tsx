"use client";

import { useEffect, useState } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import {
 ConnectComponentsProvider,
 ConnectAccountOnboarding,
 ConnectAccountManagement,
 ConnectPayouts,
 ConnectNotificationBanner,
} from "@stripe/react-connect-js";

// Embedded Connect surfaces, rendered INSIDE getvya.ai (no redirect to Stripe, no Stripe-hosted
// dashboard). Themed to VYA via the appearance API. "onboarding" collects KYC + bank; "manage"
// shows the ongoing payouts + account view that replaces the Express dashboard. `endpoint` mints
// the AccountSession (store payments by default; the consignor portal passes its own + a body),
// so the same component powers both the seller and consignor bank flows.
export default function EmbeddedPayments({
 mode,
 onComplete,
 endpoint = "/api/store/payments/account-session",
 body,
}: {
 mode: "onboarding" | "manage";
 onComplete?: () => void;
 endpoint?: string;
 body?: Record<string, unknown>;
}) {
 const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
 const [err, setErr] = useState<string | null>(null);

 useEffect(() => {
 let cancelled = false;
 const post = () => fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
 const fetchClientSecret = async (): Promise<string> => {
 const r = await post();
 const d = await r.json().catch(() => null);
 if (!r.ok || !d?.clientSecret) throw new Error(d?.error || "Couldn’t start a payment session.");
 return d.clientSecret as string;
 };
 (async () => {
 try {
 // Prime once to get the publishable key (needed synchronously to init connect-js).
 const r = await post();
 const d = await r.json().catch(() => null);
 if (!r.ok || !d?.publishableKey) throw new Error(d?.error || "Couldn’t start a payment session.");
 if (cancelled) return;
 const conn = loadConnectAndInitialize({
 publishableKey: d.publishableKey,
 fetchClientSecret,
 appearance: {
 // Match getvya.ai throughout the component internals — VYA maroon accent, stone neutrals,
 // emerald for "success", your type + radius. These flow into Stripe's rendered fields/table.
 variables: {
 fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
 fontSizeBase: "14px",
 borderRadius: "10px",
 spacingUnit: "9px",
 colorPrimary: "#5D0F17",
 colorBackground: "#ffffff",
 colorText: "#1c1917",
 colorSecondaryText: "#78716c",
 colorBorder: "#e7e5e4",
 colorDanger: "#dc2626",
 buttonPrimaryColorBackground: "#5D0F17",
 buttonPrimaryColorBorder: "#5D0F17",
 buttonPrimaryColorText: "#ffffff",
 buttonSecondaryColorBackground: "#ffffff",
 buttonSecondaryColorBorder: "#e7e5e4",
 buttonSecondaryColorText: "#1c1917",
 badgeSuccessColorBackground: "#ecfdf5",
 badgeSuccessColorText: "#047857",
 badgeSuccessColorBorder: "#a7f3d0",
 badgeNeutralColorBackground: "#f5f5f4",
 badgeNeutralColorText: "#57534e",
 formAccentColor: "#5D0F17",
 formHighlightColorBorder: "#5D0F17",
 },
 },
 });
 if (!cancelled) setInstance(conn);
 } catch (e) {
 if (!cancelled) setErr(e instanceof Error ? e.message : "Couldn’t start a payment session.");
 }
 })();
 return () => { cancelled = true; };
 // Init the Connect instance once on mount; endpoint/body are fixed per usage.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 if (err) return <p className="py-6 text-[13px] text-red-600">{err}</p>;
 if (!instance) return <div className="py-10 text-center text-[13px] text-stone-400">Loading secure payment setup…</div>;

 return (
 <ConnectComponentsProvider connectInstance={instance}>
 {mode === "onboarding" ? (
 <ConnectAccountOnboarding onExit={() => onComplete?.()} />
 ) : (
 <div className="flex flex-col gap-6">
 <ConnectNotificationBanner />
 <ConnectPayouts />
 <ConnectAccountManagement />
 </div>
 )}
 </ConnectComponentsProvider>
 );
}
