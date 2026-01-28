import { neon } from "@neondatabase/serverless";
import type {
  TasteUser,
  TasteProfile,
  TasteScores,
  TasteTag,
  QuizAnswers,
  ReferralStatus,
} from "./taste-types";

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL or POSTGRES_URL environment variable is not set.");
  }
  return url;
};

// Initialize taste match tables
export async function initTasteDatabase() {
  const sql = neon(getDatabaseUrl());

  // Users table
  await sql`
    CREATE TABLE IF NOT EXISTS taste_users (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(16) NOT NULL UNIQUE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      referrer_id VARCHAR(16),
      quiz_completed_at TIMESTAMP WITH TIME ZONE,
      unlock_status VARCHAR(20) DEFAULT 'locked'
    )
  `;

  // Taste profiles table
  await sql`
    CREATE TABLE IF NOT EXISTS taste_profiles (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(16) NOT NULL UNIQUE,
      paris_archive INT DEFAULT 0,
      nyc_street INT DEFAULT 0,
      minimal_core INT DEFAULT 0,
      designer_vintage INT DEFAULT 0,
      deal_hunter INT DEFAULT 0,
      primary_tag VARCHAR(30),
      primary_percentage INT,
      secondary_tag VARCHAR(30),
      secondary_percentage INT,
      tertiary_tag VARCHAR(30),
      tertiary_percentage INT,
      answers JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // Referral tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS referral_tracking (
      id SERIAL PRIMARY KEY,
      referrer_user_id VARCHAR(16) NOT NULL,
      referred_user_id VARCHAR(16) NOT NULL,
      quiz_completed_at TIMESTAMP WITH TIME ZONE,
      status VARCHAR(20) DEFAULT 'clicked',
      UNIQUE(referrer_user_id, referred_user_id)
    )
  `;

  // Create indexes
  await sql`
    CREATE INDEX IF NOT EXISTS idx_taste_users_user_id ON taste_users(user_id)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_referral_tracking_referrer ON referral_tracking(referrer_user_id)
  `;
}

// Create a new user
export async function createUser(
  userId: string,
  referrerId?: string | null
): Promise<TasteUser> {
  const sql = neon(getDatabaseUrl());

  await sql`
    INSERT INTO taste_users (user_id, referrer_id)
    VALUES (${userId}, ${referrerId || null})
    ON CONFLICT (user_id) DO NOTHING
  `;

  // If there's a referrer, create tracking record
  if (referrerId) {
    await sql`
      INSERT INTO referral_tracking (referrer_user_id, referred_user_id, status)
      VALUES (${referrerId}, ${userId}, 'clicked')
      ON CONFLICT (referrer_user_id, referred_user_id) DO NOTHING
    `;
  }

  const result = await sql`
    SELECT * FROM taste_users WHERE user_id = ${userId}
  `;

  return mapUserRow(result[0]);
}

// Get user by ID
export async function getUser(userId: string): Promise<TasteUser | null> {
  const sql = neon(getDatabaseUrl());

  const result = await sql`
    SELECT * FROM taste_users WHERE user_id = ${userId}
  `;

  if (result.length === 0) return null;
  return mapUserRow(result[0]);
}

// Save taste profile
export async function saveProfile(
  userId: string,
  scores: TasteScores,
  primaryTag: TasteTag,
  primaryPercentage: number,
  secondaryTag: TasteTag,
  secondaryPercentage: number,
  tertiaryTag: TasteTag,
  tertiaryPercentage: number,
  answers: QuizAnswers
): Promise<void> {
  const sql = neon(getDatabaseUrl());

  // Upsert profile
  await sql`
    INSERT INTO taste_profiles (
      user_id, paris_archive, nyc_street, minimal_core, designer_vintage, deal_hunter,
      primary_tag, primary_percentage, secondary_tag, secondary_percentage,
      tertiary_tag, tertiary_percentage, answers
    )
    VALUES (
      ${userId}, ${scores.paris_archive}, ${scores.nyc_street}, ${scores.minimal_core},
      ${scores.designer_vintage}, ${scores.deal_hunter},
      ${primaryTag}, ${primaryPercentage}, ${secondaryTag}, ${secondaryPercentage},
      ${tertiaryTag}, ${tertiaryPercentage}, ${JSON.stringify(answers)}
    )
    ON CONFLICT (user_id) DO UPDATE SET
      paris_archive = EXCLUDED.paris_archive,
      nyc_street = EXCLUDED.nyc_street,
      minimal_core = EXCLUDED.minimal_core,
      designer_vintage = EXCLUDED.designer_vintage,
      deal_hunter = EXCLUDED.deal_hunter,
      primary_tag = EXCLUDED.primary_tag,
      primary_percentage = EXCLUDED.primary_percentage,
      secondary_tag = EXCLUDED.secondary_tag,
      secondary_percentage = EXCLUDED.secondary_percentage,
      tertiary_tag = EXCLUDED.tertiary_tag,
      tertiary_percentage = EXCLUDED.tertiary_percentage,
      answers = EXCLUDED.answers,
      created_at = NOW()
  `;

  // Update user quiz completion
  await sql`
    UPDATE taste_users
    SET quiz_completed_at = NOW()
    WHERE user_id = ${userId}
  `;

  // Update referral tracking if this user was referred
  const userResult = await sql`
    SELECT referrer_id FROM taste_users WHERE user_id = ${userId}
  `;

  if (userResult.length > 0 && userResult[0].referrer_id) {
    const referrerId = userResult[0].referrer_id;

    // Mark referral as completed
    await sql`
      UPDATE referral_tracking
      SET status = 'completed', quiz_completed_at = NOW()
      WHERE referrer_user_id = ${referrerId} AND referred_user_id = ${userId}
    `;

    // Check if referrer should be unlocked (2+ completed referrals)
    const countResult = await sql`
      SELECT COUNT(*) as count FROM referral_tracking
      WHERE referrer_user_id = ${referrerId} AND status = 'completed'
    `;

    const completedCount = parseInt(countResult[0].count, 10);
    if (completedCount >= 2) {
      await sql`
        UPDATE taste_users
        SET unlock_status = 'unlocked'
        WHERE user_id = ${referrerId}
      `;
    }
  }
}

// Get taste profile
export async function getProfile(userId: string): Promise<TasteProfile | null> {
  const sql = neon(getDatabaseUrl());

  const result = await sql`
    SELECT * FROM taste_profiles WHERE user_id = ${userId}
  `;

  if (result.length === 0) return null;
  return mapProfileRow(result[0]);
}

// Get referral status for a user
export async function getReferralStatus(userId: string): Promise<ReferralStatus> {
  const sql = neon(getDatabaseUrl());

  // Get user unlock status
  const userResult = await sql`
    SELECT unlock_status FROM taste_users WHERE user_id = ${userId}
  `;

  const isUnlocked = userResult.length > 0 && userResult[0].unlock_status === 'unlocked';

  // Get completed referrals count
  const countResult = await sql`
    SELECT COUNT(*) as count FROM referral_tracking
    WHERE referrer_user_id = ${userId} AND status = 'completed'
  `;

  const completedCount = parseInt(countResult[0].count, 10);

  // Get friend profiles
  const friendsResult = await sql`
    SELECT tp.* FROM taste_profiles tp
    JOIN referral_tracking rt ON tp.user_id = rt.referred_user_id
    WHERE rt.referrer_user_id = ${userId} AND rt.status = 'completed'
    ORDER BY rt.quiz_completed_at DESC
  `;

  const friends = friendsResult.map(mapProfileRow);

  return {
    completedCount,
    isUnlocked,
    friends,
  };
}

// Helper to map database row to TasteUser
function mapUserRow(row: Record<string, unknown>): TasteUser {
  return {
    userId: row.user_id as string,
    createdAt: new Date(row.created_at as string),
    referrerId: row.referrer_id as string | null,
    quizCompletedAt: row.quiz_completed_at
      ? new Date(row.quiz_completed_at as string)
      : null,
    unlockStatus: row.unlock_status as 'locked' | 'unlocked',
  };
}

// Helper to map database row to TasteProfile
function mapProfileRow(row: Record<string, unknown>): TasteProfile {
  return {
    userId: row.user_id as string,
    scores: {
      paris_archive: row.paris_archive as number,
      nyc_street: row.nyc_street as number,
      minimal_core: row.minimal_core as number,
      designer_vintage: row.designer_vintage as number,
      deal_hunter: row.deal_hunter as number,
    },
    primaryTag: row.primary_tag as TasteTag,
    primaryPercentage: row.primary_percentage as number,
    secondaryTag: row.secondary_tag as TasteTag,
    secondaryPercentage: row.secondary_percentage as number,
    tertiaryTag: row.tertiary_tag as TasteTag,
    tertiaryPercentage: row.tertiary_percentage as number,
    answers: row.answers as QuizAnswers,
    createdAt: new Date(row.created_at as string),
  };
}
