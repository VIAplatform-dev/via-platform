import type { TasteTag, TasteTagInfo, TasteScores, QuizQuestion, QuizAnswers } from './taste-types';

// Tag metadata with colors and descriptions
export const TASTE_TAGS: Record<TasteTag, TasteTagInfo> = {
  paris_archive: {
    tag: 'paris_archive',
    label: 'Paris Archive',
    description: 'Refined vintage, archival pieces, investment dressing',
    color: '#C9A87C',
  },
  nyc_street: {
    tag: 'nyc_street',
    label: 'NYC Street',
    description: 'Oversized layers, streetwear edge, effortless cool',
    color: '#8B8B8B',
  },
  minimal_core: {
    tag: 'minimal_core',
    label: 'Minimal Core',
    description: 'Clean lines, capsule thinking, timeless staples',
    color: '#1A1A1A',
  },
  designer_vintage: {
    tag: 'designer_vintage',
    label: 'Designer Vintage',
    description: 'Runway moments, unique designers, statement pieces',
    color: '#722F37',
  },
  deal_hunter: {
    tag: 'deal_hunter',
    label: 'Deal Hunter',
    description: 'Value-driven, thrifting wins, budget-conscious style',
    color: '#2D5A27',
  },
};

// Quiz questions with scoring
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: 'What silhouette are you drawn to?',
    options: [
      {
        id: 'A',
        text: 'Tailored and structured',
        scoring: { paris_archive: 2 },
      },
      {
        id: 'B',
        text: 'Oversized and relaxed',
        scoring: { nyc_street: 2 },
      },
      {
        id: 'C',
        text: 'Clean and minimal',
        scoring: { minimal_core: 2 },
      },
      {
        id: 'D',
        text: 'Bold and statement-making',
        scoring: { designer_vintage: 2 },
      },
    ],
  },
  {
    id: 2,
    question: 'What excites you most when shopping?',
    options: [
      {
        id: 'A',
        text: 'Finding a rare archival piece',
        scoring: { paris_archive: 2 },
      },
      {
        id: 'B',
        text: 'Scoring a great deal',
        scoring: { deal_hunter: 2 },
      },
      {
        id: 'C',
        text: 'Discovering a designer gem',
        scoring: { designer_vintage: 2 },
      },
      {
        id: 'D',
        text: 'Adding a capsule staple',
        scoring: { minimal_core: 2 },
      },
    ],
  },
  {
    id: 3,
    question: 'What\'s your sweet spot for a single piece?',
    options: [
      {
        id: 'A',
        text: 'Under $50 — I love a bargain',
        scoring: { deal_hunter: 2 },
      },
      {
        id: 'B',
        text: '$50-150 — quality without splurging',
        scoring: { minimal_core: 1, nyc_street: 1 },
      },
      {
        id: 'C',
        text: '$150-300 — investing in favorites',
        scoring: { designer_vintage: 1, paris_archive: 1 },
      },
      {
        id: 'D',
        text: 'No limit for the right piece',
        scoring: { paris_archive: 2 },
      },
    ],
  },
  {
    id: 4,
    question: 'Which era speaks to you?',
    options: [
      {
        id: 'A',
        text: '70s/80s — timeless glamour',
        scoring: { paris_archive: 2 },
      },
      {
        id: 'B',
        text: '90s/Y2K — nostalgic cool',
        scoring: { nyc_street: 2 },
      },
      {
        id: 'C',
        text: 'Era-less — timeless design',
        scoring: { minimal_core: 2 },
      },
      {
        id: 'D',
        text: 'Runway archive — fashion history',
        scoring: { designer_vintage: 2 },
      },
    ],
  },
  {
    id: 5,
    question: 'Your dream thrift find?',
    options: [
      {
        id: 'A',
        text: 'A perfectly worn-in vintage coat',
        scoring: { paris_archive: 1, minimal_core: 1 },
      },
      {
        id: 'B',
        text: 'Designer piece way under retail',
        scoring: { designer_vintage: 2 },
      },
      {
        id: 'C',
        text: 'The perfect fitting jeans',
        scoring: { nyc_street: 1, minimal_core: 1 },
      },
      {
        id: 'D',
        text: 'Hidden gem under $100',
        scoring: { deal_hunter: 2 },
      },
    ],
  },
];

// Calculate scores from answers
export function calculateScores(answers: QuizAnswers): TasteScores {
  const scores: TasteScores = {
    paris_archive: 0,
    nyc_street: 0,
    minimal_core: 0,
    designer_vintage: 0,
    deal_hunter: 0,
  };

  for (const question of QUIZ_QUESTIONS) {
    const answerId = answers[question.id];
    if (!answerId) continue;

    const option = question.options.find((o) => o.id === answerId);
    if (!option) continue;

    for (const [tag, value] of Object.entries(option.scoring)) {
      scores[tag as TasteTag] += value;
    }
  }

  return scores;
}

// Get sorted tags with percentages
export function getTopTags(scores: TasteScores): {
  primary: { tag: TasteTag; percentage: number };
  secondary: { tag: TasteTag; percentage: number };
  tertiary: { tag: TasteTag; percentage: number };
} {
  const total = Object.values(scores).reduce((sum, val) => sum + val, 0);

  // If no answers, return default
  if (total === 0) {
    return {
      primary: { tag: 'minimal_core', percentage: 34 },
      secondary: { tag: 'paris_archive', percentage: 33 },
      tertiary: { tag: 'nyc_street', percentage: 33 },
    };
  }

  // Sort tags by score
  const sorted = (Object.entries(scores) as [TasteTag, number][])
    .sort((a, b) => b[1] - a[1]);

  // Calculate percentages
  const getPercentage = (score: number) => Math.round((score / total) * 100);

  return {
    primary: { tag: sorted[0][0], percentage: getPercentage(sorted[0][1]) },
    secondary: { tag: sorted[1][0], percentage: getPercentage(sorted[1][1]) },
    tertiary: { tag: sorted[2][0], percentage: getPercentage(sorted[2][1]) },
  };
}

// Generate user ID with tm_ prefix
export function generateUserId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'tm_';
  for (let i = 0; i < 9; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Get gradient colors for taste card based on primary tag
export function getTagGradient(tag: TasteTag): string {
  const gradients: Record<TasteTag, string> = {
    paris_archive: 'from-amber-100 via-amber-50 to-stone-100',
    nyc_street: 'from-gray-200 via-gray-100 to-slate-100',
    minimal_core: 'from-neutral-200 via-neutral-100 to-stone-50',
    designer_vintage: 'from-rose-100 via-rose-50 to-stone-100',
    deal_hunter: 'from-emerald-100 via-emerald-50 to-stone-100',
  };
  return gradients[tag];
}
