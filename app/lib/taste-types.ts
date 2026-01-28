// Taste Match Types

export type TasteTag =
  | 'paris_archive'
  | 'nyc_street'
  | 'minimal_core'
  | 'designer_vintage'
  | 'deal_hunter';

export interface TasteTagInfo {
  tag: TasteTag;
  label: string;
  description: string;
  color: string;
}

export interface TasteScores {
  paris_archive: number;
  nyc_street: number;
  minimal_core: number;
  designer_vintage: number;
  deal_hunter: number;
}

export interface TasteProfile {
  userId: string;
  scores: TasteScores;
  primaryTag: TasteTag;
  primaryPercentage: number;
  secondaryTag: TasteTag;
  secondaryPercentage: number;
  tertiaryTag: TasteTag;
  tertiaryPercentage: number;
  answers: QuizAnswers;
  createdAt: Date;
}

export interface QuizQuestion {
  id: number;
  question: string;
  options: {
    id: string;
    text: string;
    scoring: Partial<TasteScores>;
  }[];
}

export type QuizAnswers = {
  [questionId: number]: string; // option id
};

export interface TasteUser {
  userId: string;
  createdAt: Date;
  referrerId: string | null;
  quizCompletedAt: Date | null;
  unlockStatus: 'locked' | 'unlocked';
}

export interface ReferralTracking {
  referrerUserId: string;
  referredUserId: string;
  quizCompletedAt: Date | null;
  status: 'clicked' | 'completed';
}

export interface ReferralStatus {
  completedCount: number;
  isUnlocked: boolean;
  friends: TasteProfile[];
}
