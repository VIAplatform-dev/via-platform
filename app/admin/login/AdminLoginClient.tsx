"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function AdminLoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [step, setStep] = useState<"password" | "otp" | "reset">("password");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (step === "reset") {
        await fetch("/api/admin/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        // Always show the same confirmation — the endpoint never reveals whether the email matched.
        setResetSent(true);
        return;
      }

      const body =
        step === "otp" ? { email, password, otpCode: totpCode } : { email, password };

      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        router.push(redirect);
        router.refresh();
      } else if (data.requireOtp) {
        setStep("otp");
      } else {
        setError(data.error || "Invalid credentials");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FFFDF8" }}>
      <div className="w-full max-w-md px-6">
        <div className="bg-white p-10 shadow-sm">
          <div className="text-center mb-8">
            <div className="mb-6">
              <Image
                src="/vya-logo.png"
                alt="VYA"
                width={64}
                height={64}
                className="mx-auto"
                style={{ objectFit: "contain" }}
              />
            </div>
            <h1 className="text-2xl font-serif mb-2" style={{ color: "#5D0F17" }}>
              Admin
            </h1>
            <p className="text-sm" style={{ color: "rgba(93,15,23,0.6)" }}>
              {step === "password"
                ? "Sign in to continue"
                : step === "reset"
                ? "Enter your email to reset your password"
                : `Check ${email || "hana@vyaplatform.com"} for your code`}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === "password" ? (
              <div className="space-y-3">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoFocus
                  autoComplete="username"
                  className="w-full px-4 py-3 border text-sm outline-none transition-colors"
                  style={{ borderColor: "rgba(93,15,23,0.3)", color: "#5D0F17" }}
                  onFocus={(e) => (e.target.style.borderColor = "#5D0F17")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(93,15,23,0.3)")}
                />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 border text-sm outline-none transition-colors"
                  style={{ borderColor: "rgba(93,15,23,0.3)", color: "#5D0F17" }}
                  onFocus={(e) => (e.target.style.borderColor = "#5D0F17")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(93,15,23,0.3)")}
                />
                <button
                  type="button"
                  onClick={() => {
                    setStep("reset");
                    setError("");
                  }}
                  className="text-xs transition-colors"
                  style={{ color: "rgba(93,15,23,0.5)" }}
                >
                  Forgot your password?
                </button>
              </div>
            ) : step === "reset" ? (
              <div>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoFocus
                  autoComplete="username"
                  required
                  disabled={resetSent}
                  className="w-full px-4 py-3 border text-sm outline-none transition-colors disabled:opacity-50"
                  style={{ borderColor: "rgba(93,15,23,0.3)", color: "#5D0F17" }}
                  onFocus={(e) => (e.target.style.borderColor = "#5D0F17")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(93,15,23,0.3)")}
                />
                {resetSent && (
                  <p className="text-sm text-center mt-4" style={{ color: "rgba(93,15,23,0.7)" }}>
                    If that email belongs to an admin, a reset link is on its way. The link
                    expires in 1 hour.
                  </p>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="totp" className="sr-only">
                  Email code
                </label>
                <input
                  id="totp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder="000000"
                  autoFocus
                  autoComplete="one-time-code"
                  required
                  className="w-full px-4 py-3 border text-2xl tracking-[0.4em] text-center font-mono outline-none transition-colors"
                  style={{ borderColor: "rgba(93,15,23,0.3)", color: "#5D0F17" }}
                  onFocus={(e) => (e.target.style.borderColor = "#5D0F17")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(93,15,23,0.3)")}
                />
              </div>
            )}

            {error && (
              <p className="text-red-600 text-sm text-center">{error}</p>
            )}

            {!(step === "reset" && resetSent) && (
              <button
                type="submit"
                disabled={
                  loading ||
                  (step === "password" ? !password : step === "reset" ? !email : !totpCode)
                }
                className="w-full py-3 text-sm uppercase tracking-wide transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#5D0F17", color: "#FFFDF8" }}
              >
                {loading
                  ? "Verifying…"
                  : step === "password"
                  ? "Continue"
                  : step === "reset"
                  ? "Send reset link"
                  : "Sign In"}
              </button>
            )}

            {(step === "otp" || step === "reset") && (
              <button
                type="button"
                onClick={() => {
                  setStep("password");
                  setTotpCode("");
                  setError("");
                  setResetSent(false);
                }}
                className="w-full text-sm transition-colors"
                style={{ color: "rgba(93,15,23,0.5)" }}
              >
                Back to sign in
              </button>
            )}
          </form>

          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <Link
              href="/login?callbackUrl=/admin"
              className="text-sm underline transition-colors"
              style={{ color: "#5D0F17" }}
            >
              Sign in to your store →
            </Link>
            <Link
              href="/"
              className="text-sm transition-colors"
              style={{ color: "rgba(93,15,23,0.5)" }}
            >
              Back to VYA
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
