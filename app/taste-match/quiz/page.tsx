"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import QuizQuestion from "@/app/components/taste-match/QuizQuestion";
import QuizProgress from "@/app/components/taste-match/QuizProgress";
import { QUIZ_QUESTIONS } from "@/app/lib/taste-scoring";
import type { QuizAnswers } from "@/app/lib/taste-types";

export default function QuizPage() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const storedUserId = localStorage.getItem("via_taste_user_id");
    if (!storedUserId) {
      router.push("/taste-match");
      return;
    }
    setUserId(storedUserId);
  }, [router]);

  const currentQuestion = QUIZ_QUESTIONS[currentIndex];
  const isLastQuestion = currentIndex === QUIZ_QUESTIONS.length - 1;

  const handleSelect = async (optionId: string) => {
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: optionId,
    };
    setAnswers(newAnswers);

    // Delay for visual feedback
    await new Promise((resolve) => setTimeout(resolve, 300));

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
        // Store profile in localStorage for offline/fallback access
        if (data.profile) {
          localStorage.setItem(
            `via_taste_profile_${userId}`,
            JSON.stringify(data.profile)
          );
        }
        router.push(`/taste-match/${userId}`);
      } else {
        console.error("Failed to submit quiz");
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Submit error:", error);
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  if (!userId) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (isSubmitting) {
    return (
      <main className="min-h-screen bg-[#f7f6f3] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse mb-4">
            <div className="w-12 h-12 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
          <p className="text-gray-600">Calculating your taste...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f3] flex flex-col">
      {/* Header */}
      <div className="py-6 px-6">
        <div className="max-w-lg mx-auto">
          <QuizProgress
            current={currentIndex + 1}
            total={QUIZ_QUESTIONS.length}
          />
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <QuizQuestion
          question={currentQuestion}
          selectedAnswer={answers[currentQuestion.id] || null}
          onSelect={handleSelect}
        />
      </div>

      {/* Back button */}
      {currentIndex > 0 && (
        <div className="pb-8 px-6">
          <button
            onClick={handleBack}
            className="mx-auto block text-sm text-gray-500 hover:text-black transition"
          >
            ← Previous question
          </button>
        </div>
      )}
    </main>
  );
}
