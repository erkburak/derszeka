import "server-only";

import { runStructured } from "@/lib/ai/service";
import {
  documentAnalysisPrompt,
  flashcardPrompt,
  quizPrompt,
} from "@/lib/ai/prompts";
import {
  flashcardsSchema,
  quizSchema,
  studySetSchema,
} from "@/lib/ai/schemas";
import { clampToTokens } from "@/lib/documents/chunk";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getLimit } from "@/lib/limits";
import type {
  CardDifficulty,
  Profile,
  QuestionType,
  SourceRef,
} from "@/lib/types";

/** Sayfa başına ~800 token varsayımıyla plan bazlı analiz bütçesi. */
export async function analysisTokenBudget(profile: Profile): Promise<number> {
  const maxPages = await getLimit(profile.plan, "max_pages_per_document");
  return Math.min(Math.max(maxPages * 800, 8000), 100_000);
}

async function loadDocumentText(
  documentId: string,
  tokenBudget: number,
): Promise<{ text: string; title: string }> {
  const supabase = createAdminSupabase();

  const [{ data: doc }, { data: pages }] = await Promise.all([
    supabase.from("documents").select("title").eq("id", documentId).single(),
    supabase
      .from("document_pages")
      .select("page_number, content")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true }),
  ]);

  const text = (pages ?? [])
    .map((page) => `[[SAYFA ${page.page_number}]]\n${page.content}`)
    .join("\n\n");

  return {
    text: clampToTokens(text, tokenBudget),
    title: (doc?.title as string) ?? "Materyal",
  };
}

interface StudySetPayload {
  title: string;
  language: string;
  summary_short: string;
  summary_detailed: string;
  section_summaries: { title: string; content: string; page: number | null }[];
  key_points: { text: string; source: SourceRef }[];
  exam_critical: { text: string; source: SourceRef }[];
  definitions: { term: string; definition: string; source: SourceRef }[];
  formulas: {
    name: string;
    expression: string;
    explanation: string;
    source: SourceRef;
  }[];
  dates: { date: string; event: string; source: SourceRef }[];
  names: { name: string; description: string; source: SourceRef }[];
  comparisons: { title: string; left: string; right: string; difference: string }[];
  cause_effects: { cause: string; effect: string }[];
  topics: {
    title: string;
    description: string;
    importance: number;
    page_from: number | null;
    page_to: number | null;
    subtopics: string[];
  }[];
}

/** Materyali analiz edip study_set + topics kayıtlarını oluşturur. */
export async function generateStudySet(params: {
  profile: Profile;
  documentId: string;
}): Promise<{ studySetId: string; topicCount: number }> {
  const budget = await analysisTokenBudget(params.profile);
  const { text, title } = await loadDocumentText(params.documentId, budget);

  if (text.trim().length < 50) {
    throw new Error("Materyalden yeterli metin çıkarılamadı.");
  }

  const { data } = await runStructured<StudySetPayload>({
    profile: params.profile,
    operation: "DOCUMENT_ANALYSIS",
    documentId: params.documentId,
    system: documentAnalysisPrompt,
    jsonSchema: studySetSchema,
    maxOutputTokens: 16000,
    skipQuota: true,
    messages: [
      {
        role: "user",
        content: `Materyal adı: ${title}\n\nMATERYAL İÇERİĞİ:\n\n${text}`,
      },
    ],
  });

  const supabase = createAdminSupabase();

  const { data: studySet, error } = await supabase
    .from("study_sets")
    .insert({
      document_id: params.documentId,
      owner_id: params.profile.id,
      title: data.title || title,
      summary_short: data.summary_short,
      summary_detailed: data.summary_detailed,
      section_summaries: data.section_summaries ?? [],
      key_points: data.key_points ?? [],
      exam_critical: data.exam_critical ?? [],
      definitions: data.definitions ?? [],
      formulas: data.formulas ?? [],
      dates: data.dates ?? [],
      names: data.names ?? [],
      comparisons: data.comparisons ?? [],
      cause_effects: data.cause_effects ?? [],
    })
    .select("id")
    .single();

  if (error) throw new Error(`Çalışma seti kaydedilemedi: ${error.message}`);

  let topicCount = 0;
  for (const [index, topic] of (data.topics ?? []).entries()) {
    const { data: parent } = await supabase
      .from("topics")
      .insert({
        document_id: params.documentId,
        owner_id: params.profile.id,
        title: topic.title,
        description: topic.description,
        importance: Math.min(Math.max(topic.importance || 3, 1), 5),
        order_index: index,
        page_from: topic.page_from,
        page_to: topic.page_to,
      })
      .select("id")
      .single();

    topicCount += 1;

    if (parent && topic.subtopics?.length) {
      await supabase.from("topics").insert(
        topic.subtopics.map((sub, subIndex) => ({
          document_id: params.documentId,
          owner_id: params.profile.id,
          parent_id: parent.id,
          title: sub,
          importance: 3,
          order_index: subIndex,
        })),
      );
      topicCount += topic.subtopics.length;
    }
  }

  if (data.language) {
    await supabase
      .from("documents")
      .update({ language: data.language })
      .eq("id", params.documentId);
  }

  return { studySetId: studySet.id as string, topicCount };
}

interface FlashcardPayload {
  cards: {
    front: string;
    back: string;
    hint: string;
    difficulty: CardDifficulty;
    topic: string;
    source: SourceRef;
  }[];
}

export async function generateFlashcards(params: {
  profile: Profile;
  documentId: string;
  studySetId: string | null;
  count: number;
  topicId?: string | null;
  topicTitle?: string | null;
  skipQuota?: boolean;
}): Promise<number> {
  const budget = await analysisTokenBudget(params.profile);
  const { text, title } = await loadDocumentText(params.documentId, budget);

  const focus = params.topicTitle
    ? `\n\nYalnızca şu konuya odaklan: ${params.topicTitle}`
    : "";

  const { data } = await runStructured<FlashcardPayload>({
    profile: params.profile,
    operation: "FLASHCARD_GENERATION",
    documentId: params.documentId,
    system: flashcardPrompt,
    jsonSchema: flashcardsSchema,
    maxOutputTokens: 16000,
    skipQuota: params.skipQuota,
    messages: [
      {
        role: "user",
        content: `Materyal adı: ${title}\nÜretilecek kart sayısı: ${params.count}${focus}\n\nMATERYAL İÇERİĞİ:\n\n${text}`,
      },
    ],
  });

  const cards = (data.cards ?? []).slice(0, params.count);
  if (cards.length === 0) return 0;

  const supabase = createAdminSupabase();
  const { data: topics } = await supabase
    .from("topics")
    .select("id, title")
    .eq("document_id", params.documentId);

  const topicByTitle = new Map(
    (topics ?? []).map((t) => [(t.title as string).toLowerCase(), t.id as string]),
  );

  const { error } = await supabase.from("flashcards").insert(
    cards.map((card) => ({
      study_set_id: params.studySetId,
      document_id: params.documentId,
      owner_id: params.profile.id,
      topic_id:
        params.topicId ?? topicByTitle.get((card.topic ?? "").toLowerCase()) ?? null,
      front: card.front,
      back: card.back,
      hint: card.hint || null,
      difficulty: card.difficulty ?? "medium",
      source_ref: card.source ?? {},
    })),
  );

  if (error) throw new Error(`Flashcardlar kaydedilemedi: ${error.message}`);
  return cards.length;
}

interface QuizPayload {
  title: string;
  questions: {
    q_type: QuestionType;
    prompt: string;
    options: string[];
    correct_answer: string;
    explanation: string;
    difficulty: CardDifficulty;
    source: SourceRef;
  }[];
}

export async function generateQuiz(params: {
  profile: Profile;
  documentId: string;
  studySetId: string | null;
  count: number;
  mode: string;
  difficulty?: CardDifficulty;
  topicId?: string | null;
  topicTitle?: string | null;
  skipQuota?: boolean;
}): Promise<{ quizId: string; questionCount: number }> {
  const budget = await analysisTokenBudget(params.profile);
  const { text, title } = await loadDocumentText(params.documentId, budget);

  const typeInstruction =
    params.mode === "mixed"
      ? "Soru tiplerini karışık kullan (çoktan seçmeli ağırlıklı olsun)."
      : `Tüm soruları "${params.mode}" tipinde üret.`;

  const focus = params.topicTitle
    ? `\nYalnızca şu konuya odaklan: ${params.topicTitle}`
    : "";

  const { data } = await runStructured<QuizPayload>({
    profile: params.profile,
    operation: "QUIZ_GENERATION",
    documentId: params.documentId,
    system: quizPrompt,
    jsonSchema: quizSchema,
    maxOutputTokens: 16000,
    skipQuota: params.skipQuota,
    messages: [
      {
        role: "user",
        content: `Materyal adı: ${title}\nSoru sayısı: ${params.count}\nGenel zorluk: ${params.difficulty ?? "medium"}\n${typeInstruction}${focus}\n\nMATERYAL İÇERİĞİ:\n\n${text}`,
      },
    ],
  });

  const questions = (data.questions ?? []).slice(0, params.count);
  const supabase = createAdminSupabase();

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .insert({
      study_set_id: params.studySetId,
      document_id: params.documentId,
      owner_id: params.profile.id,
      topic_id: params.topicId ?? null,
      title: data.title || `${title} Quiz`,
      mode: params.mode,
      difficulty: params.difficulty ?? "medium",
      question_count: questions.length,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Quiz kaydedilemedi: ${error.message}`);

  if (questions.length > 0) {
    const { error: questionError } = await supabase.from("quiz_questions").insert(
      questions.map((question, index) => ({
        quiz_id: quiz.id,
        owner_id: params.profile.id,
        q_type: question.q_type,
        prompt: question.prompt,
        options: question.options ?? [],
        correct_answer: { value: question.correct_answer },
        explanation: question.explanation,
        source_ref: question.source ?? {},
        difficulty: question.difficulty ?? "medium",
        order_index: index,
      })),
    );
    if (questionError) {
      throw new Error(`Sorular kaydedilemedi: ${questionError.message}`);
    }
  }

  return { quizId: quiz.id as string, questionCount: questions.length };
}
