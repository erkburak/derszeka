/** Uygulama genelinde kullanılan domain tipleri (DB satırlarıyla birebir). */

export type UserRole = "user" | "admin";
export type PlanType = "free" | "premium";
export type DocumentStatus =
  | "queued"
  | "extracting"
  | "analyzing"
  | "embedding"
  | "generating"
  | "completed"
  | "failed";
export type PaymentStatus = "pending" | "approved" | "rejected";
export type SubscriptionStatus = "active" | "expired" | "cancelled";
export type CardDifficulty = "easy" | "medium" | "hard" | "very_hard";
export type CardResult = "known" | "unsure" | "unknown";
export type QuestionType =
  | "multiple_choice"
  | "true_false"
  | "fill_blank"
  | "matching"
  | "short_answer"
  | "open_ended";
export type AIProviderName = "anthropic" | "openai" | "google";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type AIOperation =
  | "DOCUMENT_ANALYSIS"
  | "OCR"
  | "SUMMARY"
  | "TOPIC_EXTRACTION"
  | "FLASHCARD_GENERATION"
  | "QUIZ_GENERATION"
  | "QUESTION_GENERATION"
  | "ANSWER_EVALUATION"
  | "AI_TUTOR"
  | "STUDY_PLAN"
  | "GUIDED_STUDY"
  | "EMBEDDING";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  plan: PlanType;
  plan_expires_at: string | null;
  is_active: boolean;
  onboarding_completed: boolean;
  education_level: string | null;
  field_of_study: string | null;
  study_goal: string | null;
  daily_goal_minutes: number;
  xp: number;
  streak_count: number;
  longest_streak: number;
  last_study_date: string | null;
  leaderboard_opt_in: boolean;
  email_notifications: boolean;
  study_reminders: boolean;
  last_reminder_sent_at: string | null;
  last_login_at: string | null;
  anonymized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  owner_id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  storage_path: string | null;
  source_kind: string;
  status: DocumentStatus;
  progress: number;
  status_message: string | null;
  error_message: string | null;
  page_count: number;
  char_count: number;
  language: string | null;
  extraction_method: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceRef {
  page?: number | null;
  section?: string | null;
  quote?: string | null;
  document_id?: string | null;
  document_title?: string | null;
}

export interface StudySet {
  id: string;
  document_id: string;
  owner_id: string;
  title: string;
  summary_short: string | null;
  summary_detailed: string | null;
  section_summaries: { title: string; content: string; page?: number | null }[];
  key_points: { text: string; source?: SourceRef }[];
  exam_critical: { text: string; source?: SourceRef }[];
  definitions: { term: string; definition: string; source?: SourceRef }[];
  formulas: { name: string; expression: string; explanation?: string; source?: SourceRef }[];
  dates: { date: string; event: string; source?: SourceRef }[];
  names: { name: string; description: string; source?: SourceRef }[];
  comparisons: { title: string; left: string; right: string; difference: string }[];
  cause_effects: { cause: string; effect: string }[];
  created_at: string;
  updated_at: string;
}

export interface Topic {
  id: string;
  document_id: string;
  owner_id: string;
  parent_id: string | null;
  title: string;
  description: string | null;
  importance: number;
  order_index: number;
  page_from: number | null;
  page_to: number | null;
  created_at: string;
}

export interface Flashcard {
  id: string;
  study_set_id: string | null;
  document_id: string;
  owner_id: string;
  topic_id: string | null;
  front: string;
  back: string;
  hint: string | null;
  difficulty: CardDifficulty;
  source_ref: SourceRef;
  created_at: string;
}

export interface FlashcardProgress {
  id: string;
  flashcard_id: string;
  user_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  review_count: number;
  last_result: CardResult | null;
  last_reviewed_at: string | null;
  due_at: string;
  updated_at: string;
}

export interface Quiz {
  id: string;
  study_set_id: string | null;
  document_id: string;
  owner_id: string;
  topic_id: string | null;
  title: string;
  mode: string;
  difficulty: CardDifficulty;
  question_count: number;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  owner_id: string;
  q_type: QuestionType;
  prompt: string;
  /** multiple_choice/matching için seçenekler. */
  options: string[];
  /** { value: string } veya eşleştirme için { pairs: [[sol, sağ]] }. */
  correct_answer: { value?: string; values?: string[]; pairs?: [string, string][] };
  explanation: string | null;
  source_ref: SourceRef;
  difficulty: CardDifficulty;
  order_index: number;
  created_at: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  page_from: number | null;
  page_to: number | null;
  section_title: string | null;
  score: number;
}

export interface Citation {
  document_id: string;
  document_title: string;
  page: number | null;
  section: string | null;
  quote: string | null;
}

export interface PaymentRequest {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  amount: number;
  currency: string;
  receipt_path: string | null;
  note: string | null;
  status: PaymentStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIModelRow {
  id: string;
  provider: AIProviderName;
  model_key: string;
  display_name: string;
  purpose: "chat" | "vision" | "embedding";
  is_active: boolean;
  is_default: boolean;
  requires_premium: boolean;
  input_price_per_1m: number;
  output_price_per_1m: number;
  max_input_tokens: number;
  max_output_tokens: number;
  supports_vision: boolean;
  supports_pdf: boolean;
  priority: number;
}

export interface ProcessingJob {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  document_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyPlanItem {
  id: string;
  plan_id: string;
  user_id: string;
  scheduled_date: string;
  topic_title: string;
  document_id: string | null;
  activity: "read" | "flashcard" | "quiz" | "review";
  duration_minutes: number;
  order_index: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}
