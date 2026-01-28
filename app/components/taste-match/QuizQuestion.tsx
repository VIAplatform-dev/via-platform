"use client";

import type { QuizQuestion as QuizQuestionType } from "@/app/lib/taste-types";

interface QuizQuestionProps {
  question: QuizQuestionType;
  selectedAnswer: string | null;
  onSelect: (optionId: string) => void;
}

export default function QuizQuestion({
  question,
  selectedAnswer,
  onSelect,
}: QuizQuestionProps) {
  return (
    <div className="w-full max-w-lg mx-auto animate-fadeIn">
      <h2 className="text-2xl sm:text-3xl font-serif text-center mb-8">
        {question.question}
      </h2>

      <div className="space-y-3">
        {question.options.map((option) => {
          const isSelected = selectedAnswer === option.id;
          return (
            <button
              key={option.id}
              onClick={() => onSelect(option.id)}
              className={`
                w-full p-4 text-left border-2 transition-all duration-200
                ${
                  isSelected
                    ? "border-black bg-black text-white"
                    : "border-gray-200 hover:border-gray-400 bg-white"
                }
              `}
            >
              <span className="text-sm sm:text-base">{option.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
