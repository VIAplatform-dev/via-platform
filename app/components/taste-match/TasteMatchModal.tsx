"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import QuizQuestion from "./QuizQuestion";
import QuizProgress from "./QuizProgress";
import TasteCard from "./TasteCard";
import ShareButton from "./ShareButton";
import { QUIZ_QUESTIONS, generateUserId } from "@/app/lib/taste-scoring";
import type { QuizAnswers, TasteTag } from "@/app/lib/taste-types";

interface TasteMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalStep = "landing" | "quiz" | "invite" | "results";

interface ProfileData {
  userId: string;
  primaryTag: TasteTag;
  primaryPercentage: number;
  secondaryTag: TasteTag;
  secondaryPercentage: number;
  tertiaryTag: TasteTag;
  tertiaryPercentage: number;
}

export default function TasteMatchModal({ isOpen, onClose }: TasteMatchModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<ModalStep>("landing");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<[string, string]>(["", ""]);
  const [phoneErrors, setPhoneErrors] = useState<[string, string]>(["", ""]);

  // Initialize or retrieve user ID
  useEffect(() => {
    if (isOpen) {
      let storedUserId = localStorage.getItem("via_taste_user_id");

      // Check if user already has a profile AND has unlocked results
      if (storedUserId) {
        const storedProfile = localStorage.getItem(`via_taste_profile_${storedUserId}`);
        const hasUnlocked = localStorage.getItem(`via_taste_unlocked_${storedUserId}`);
        if (storedProfile && hasUnlocked) {
          const parsed = JSON.parse(storedProfile);
          setProfile(parsed);
          setUserId(storedUserId);
          setStep("results");
          return;
        } else if (storedProfile) {
          // Has profile but hasn't unlocked - go to invite step
          const parsed = JSON.parse(storedProfile);
          setProfile(parsed);
          setUserId(storedUserId);
          setStep("invite");
          return;
        }
      }

      // Create new user ID if needed
      if (!storedUserId) {
        storedUserId = generateUserId();
        localStorage.setItem("via_taste_user_id", storedUserId);
      }
      setUserId(storedUserId);
    }
  }, [isOpen]);

  // Reset state when modal closes
  const handleClose = useCallback(() => {
    // Only reset quiz state if not on results
    if (step !== "results") {
      setStep("landing");
      setCurrentIndex(0);
      setAnswers({});
    }
    onClose();
  }, [step, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleStartQuiz = async () => {
    // Create user in database (optional, may fail without DB)
    if (userId) {
      try {
        await fetch("/api/taste-match/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      } catch {
        // Continue even if user creation fails
      }
    }
    setStep("quiz");
  };

  const handleSelectAnswer = async (optionId: string) => {
    const currentQuestion = QUIZ_QUESTIONS[currentIndex];
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: optionId,
    };
    setAnswers(newAnswers);

    // Small delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 250));

    const isLastQuestion = currentIndex === QUIZ_QUESTIONS.length - 1;
    if (isLastQuestion) {
      await handleSubmit(newAnswers);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleSubmit = async (finalAnswers: QuizAnswers) => {
    if (!userId || isSubmitting) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/taste-match/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          answers: finalAnswers,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.profile) {
          localStorage.setItem(
            `via_taste_profile_${userId}`,
            JSON.stringify(data.profile)
          );
          setProfile(data.profile);
        }
        // Go to invite step instead of results
        setStep("invite");
      } else {
        console.error("Failed to submit quiz");
      }
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatPhoneNumber = (value: string): string => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const validatePhone = (phone: string): boolean => {
    const digits = phone.replace(/\D/g, "");
    return digits.length === 10;
  };

  const handlePhoneChange = (index: 0 | 1, value: string) => {
    const formatted = formatPhoneNumber(value);
    const newPhones: [string, string] = [...phoneNumbers] as [string, string];
    newPhones[index] = formatted;
    setPhoneNumbers(newPhones);

    // Clear error when typing
    const newErrors: [string, string] = [...phoneErrors] as [string, string];
    newErrors[index] = "";
    setPhoneErrors(newErrors);
  };

  const [isSendingInvites, setIsSendingInvites] = useState(false);

  const handleUnlockResults = async () => {
    const newErrors: [string, string] = ["", ""];
    let hasError = false;

    // Validate both phone numbers
    if (!validatePhone(phoneNumbers[0])) {
      newErrors[0] = "Please enter a valid phone number";
      hasError = true;
    }
    if (!validatePhone(phoneNumbers[1])) {
      newErrors[1] = "Please enter a valid phone number";
      hasError = true;
    }

    // Check if phone numbers are the same
    if (!hasError && phoneNumbers[0] === phoneNumbers[1]) {
      newErrors[1] = "Please enter two different phone numbers";
      hasError = true;
    }

    if (hasError) {
      setPhoneErrors(newErrors);
      return;
    }

    setIsSendingInvites(true);

    // Send SMS invites
    console.log("[TasteMatch Client] Sending invites to:", phoneNumbers);
    console.log("[TasteMatch Client] Referrer ID:", userId);

    try {
      const response = await fetch("/api/taste-match/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumbers,
          referrerId: userId,
        }),
      });

      const data = await response.json();
      console.log("[TasteMatch Client] API Response:", response.status, data);

      if (!response.ok) {
        console.error("[TasteMatch Client] API Error:", data);
      } else if (data.failed > 0) {
        console.warn("[TasteMatch Client] Some SMS failed:", data);
      } else {
        console.log("[TasteMatch Client] SMS sent successfully:", data);
      }
    } catch (error) {
      console.error("[TasteMatch Client] Failed to send invites:", error);
      // Continue even if SMS fails
    }

    // Save invited friends and mark as unlocked
    if (userId) {
      localStorage.setItem(
        `via_taste_invites_${userId}`,
        JSON.stringify(phoneNumbers)
      );
      localStorage.setItem(`via_taste_unlocked_${userId}`, "true");
    }

    setIsSendingInvites(false);
    setStep("results");
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleViewFullResults = () => {
    if (userId) {
      router.push(`/taste-match/${userId}`);
      handleClose();
    }
  };

  const handleRetakeQuiz = () => {
    // Clear existing profile and unlock status
    if (userId) {
      localStorage.removeItem(`via_taste_profile_${userId}`);
      localStorage.removeItem(`via_taste_unlocked_${userId}`);
      localStorage.removeItem(`via_taste_invites_${userId}`);
    }
    setProfile(null);
    setAnswers({});
    setCurrentIndex(0);
    setPhoneNumbers(["", ""]);
    setPhoneErrors(["", ""]);
    setStep("landing");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto bg-[#f7f6f3] rounded-lg shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-10 p-2 text-gray-500 hover:text-black transition"
          aria-label="Close modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Landing Step */}
        {step === "landing" && (
          <div className="p-8 sm:p-12 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-4">
              VIA Taste Match
            </p>

            <h2 className="text-3xl sm:text-4xl font-serif mb-4 text-black leading-tight">
              Discover Your
              <br />
              Fashion Taste
            </h2>

            <p className="text-gray-600 mb-8 max-w-sm mx-auto">
              Answer 5 quick questions to uncover your unique style profile.
            </p>

            <button
              onClick={handleStartQuiz}
              className="bg-black text-white px-8 py-4 text-sm uppercase tracking-wide hover:bg-neutral-800 transition"
            >
              Start Quiz
            </button>
          </div>
        )}

        {/* Quiz Step */}
        {step === "quiz" && !isSubmitting && (
          <div className="p-6 sm:p-8">
            <div className="mb-6">
              <QuizProgress
                current={currentIndex + 1}
                total={QUIZ_QUESTIONS.length}
              />
            </div>

            <QuizQuestion
              question={QUIZ_QUESTIONS[currentIndex]}
              selectedAnswer={answers[QUIZ_QUESTIONS[currentIndex].id] || null}
              onSelect={handleSelectAnswer}
            />

            {currentIndex > 0 && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleBack}
                  className="text-sm text-gray-500 hover:text-black transition"
                >
                  ← Previous question
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {step === "quiz" && isSubmitting && (
          <div className="p-12 text-center">
            <div className="animate-pulse mb-4">
              <div className="w-12 h-12 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
            <p className="text-gray-600">Calculating your taste...</p>
          </div>
        )}

        {/* Invite Step - Gate results behind friend invites */}
        {step === "invite" && (
          <div className="p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-black/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-serif mb-2">Almost there!</h2>
              <p className="text-gray-600 text-sm max-w-xs mx-auto">
                Invite 2 friends to discover their taste and unlock your results.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Friend 1 Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumbers[0]}
                  onChange={(e) => handlePhoneChange(0, e.target.value)}
                  placeholder="(555) 123-4567"
                  className={`w-full px-4 py-3 border ${
                    phoneErrors[0] ? "border-red-400" : "border-gray-300"
                  } focus:border-black focus:outline-none transition text-center text-lg tracking-wide`}
                />
                {phoneErrors[0] && (
                  <p className="text-red-500 text-xs mt-1">{phoneErrors[0]}</p>
                )}
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wide text-gray-500 mb-2">
                  Friend 2 Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumbers[1]}
                  onChange={(e) => handlePhoneChange(1, e.target.value)}
                  placeholder="(555) 987-6543"
                  className={`w-full px-4 py-3 border ${
                    phoneErrors[1] ? "border-red-400" : "border-gray-300"
                  } focus:border-black focus:outline-none transition text-center text-lg tracking-wide`}
                />
                {phoneErrors[1] && (
                  <p className="text-red-500 text-xs mt-1">{phoneErrors[1]}</p>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center mb-6">
              We&apos;ll send them a text with a link to take the quiz.
            </p>

            <button
              onClick={handleUnlockResults}
              disabled={isSendingInvites}
              className="w-full bg-black text-white py-4 px-6 text-sm uppercase tracking-wide hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSendingInvites ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending Invites...
                </>
              ) : (
                "Unlock My Results"
              )}
            </button>
          </div>
        )}

        {/* Results Step */}
        {step === "results" && profile && (
          <div className="p-6 sm:p-8">
            <div className="text-center mb-6">
              <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-2">
                Your Taste Profile
              </p>
            </div>

            <TasteCard
              primaryTag={profile.primaryTag}
              primaryPercentage={profile.primaryPercentage}
              secondaryTag={profile.secondaryTag}
              secondaryPercentage={profile.secondaryPercentage}
              tertiaryTag={profile.tertiaryTag}
              tertiaryPercentage={profile.tertiaryPercentage}
            />

            <div className="mt-6 space-y-3">
              {userId && <ShareButton userId={userId} />}

              <button
                onClick={handleViewFullResults}
                className="w-full border border-black py-3 px-6 text-sm uppercase tracking-wide hover:bg-black hover:text-white transition"
              >
                View Full Results
              </button>

              <button
                onClick={handleRetakeQuiz}
                className="w-full text-sm text-gray-500 hover:text-black transition py-2"
              >
                Retake Quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
