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
import { getSettings } from "@/lib/settings";
import type {
  CardDifficulty,
  Profile,
  QuestionType,
  SourceRef,
  StudySet,
} from "@/lib/types";

/** Sayfa başına ~800 token varsayımıyla plan bazlı analiz bütçesi. */
export async function analysisTokenBudget(profile: Profile): Promise<number> {
  const maxPages = await getLimit(profile.plan, "max_pages_per_document");
  return Math.min(Math.max(maxPages * 800, 8000), 100_000);
}

/**
 * Flashcard ve quiz üretimi için damıtılmış kaynak.
 *
 * Ham metni her üretimde yeniden göndermek maliyetin en büyük kalemiydi:
 * 30 sayfalık bir materyal üç kez gönderilince ~72k girdi tokeni ediyordu.
 * Analiz zaten materyali özetleyip önemli bilgileri çıkardığı için, kart ve
 * soru üretimi bu çıktıdan beslenebilir — hem ~5 kat ucuz hem de daha odaklı.
 */
async function loadStudyDigest(
  documentId: string,
): Promise<{ digest: string; title: string } | null> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("study_sets")
    .select(
      "title, summary_short, summary_detailed, section_summaries, key_points, exam_critical, definitions, formulas, dates, names, comparisons, cause_effects",
    )
    .eq("document_id", documentId)
    .maybeSingle();

  if (!data) return null;
  const set = data as unknown as StudySet;

  const lines: string[] = [`MATERYAL: ${set.title}`, "", "ÖZET:", set.summary_short ?? ""];

  const push = (heading: string, items: string[]) => {
    if (items.length === 0) return;
    lines.push("", `${heading}:`, ...items.map((item) => `- ${item}`));
  };

  const withPage = (text: string, source?: SourceRef) => {
    const page = source?.page ? ` [sayfa ${source.page}]` : "";
    return `${text}${page}`;
  };

  if (set.summary_detailed) lines.push("", "DETAYLI ÖZET:", set.summary_detailed);

  push(
    "BÖLÜMLER",
    (set.section_summaries ?? []).map(
      (section) => `${section.title}: ${section.content}`,
    ),
  );
  push(
    "ÖNEMLİ BİLGİLER",
    (set.key_points ?? []).map((item) => withPage(item.text, item.source)),
  );
  push(
    "SINAVDA KRİTİK",
    (set.exam_critical ?? []).map((item) => withPage(item.text, item.source)),
  );
  push(
    "TANIMLAR",
    (set.definitions ?? []).map((item) =>
      withPage(`${item.term}: ${item.definition}`, item.source),
    ),
  );
  push(
    "FORMÜLLER",
    (set.formulas ?? []).map((item) =>
      withPage(`${item.name} = ${item.expression} (${item.explanation ?? ""})`, item.source),
    ),
  );
  push(
    "TARİHLER",
    (set.dates ?? []).map((item) => withPage(`${item.date}: ${item.event}`, item.source)),
  );
  push(
    "İSİMLER",
    (set.names ?? []).map((item) =>
      withPage(`${item.name}: ${item.description}`, item.source),
    ),
  );
  push(
    "KARŞILAŞTIRMALAR",
    (set.comparisons ?? []).map(
      (item) => `${item.title} — ${item.left} / ${item.right}: ${item.difference}`,
    ),
  );
  push(
    "SEBEP-SONUÇ",
    (set.cause_effects ?? []).map((item) => `${item.cause} → ${item.effect}`),
  );

  const digest = lines.join("\n").trim();
  // Analiz zayıf kaldıysa damıtılmış kaynak yetersizdir; ham metne düşülür.
  if (digest.length < 400) return null;

  return { digest, title: set.title };
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

/** Modelden düz alanlarla gelir; kayıt sırasında `source_ref`e dönüştürülür. */
interface StudySetPayload {
  title: string;
  language: string;
  summary_short: string;
  summary_detailed: string;
  section_summaries: { title: string; content: string; page: number }[];
  key_points: { text: string; page: number; section: string }[];
  exam_critical: { text: string; page: number; section: string }[];
  definitions: { term: string; definition: string; page: number }[];
  formulas: {
    name: string;
    expression: string;
    explanation: string;
    page: number;
  }[];
  dates: { date: string; event: string; page: number }[];
  names: { name: string; description: string; page: number }[];
  comparisons: { title: string; left: string; right: string; difference: string }[];
  cause_effects: { cause: string; effect: string }[];
  topics: {
    title: string;
    description: string;
    importance: number;
    page_from: number;
    page_to: number;
    subtopics: string[];
  }[];
}

/** 0 sayfa ve boş bölüm "bilinmiyor" demektir; kaynak etiketi gösterilmez. */
function toSourceRef(page?: number, section?: string): SourceRef {
  const ref: SourceRef = {};
  if (page && page > 0) ref.page = page;
  if (section && section.trim()) ref.section = section.trim();
  return ref;
}

function nullablePage(page?: number): number | null {
  return page && page > 0 ? page : null;
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
      section_summaries: (data.section_summaries ?? []).map((item) => ({
        title: item.title,
        content: item.content,
        page: nullablePage(item.page),
      })),
      key_points: (data.key_points ?? []).map((item) => ({
        text: item.text,
        source: toSourceRef(item.page, item.section),
      })),
      exam_critical: (data.exam_critical ?? []).map((item) => ({
        text: item.text,
        source: toSourceRef(item.page, item.section),
      })),
      definitions: (data.definitions ?? []).map((item) => ({
        term: item.term,
        definition: item.definition,
        source: toSourceRef(item.page),
      })),
      formulas: (data.formulas ?? []).map((item) => ({
        name: item.name,
        expression: item.expression,
        explanation: item.explanation,
        source: toSourceRef(item.page),
      })),
      dates: (data.dates ?? []).map((item) => ({
        date: item.date,
        event: item.event,
        source: toSourceRef(item.page),
      })),
      names: (data.names ?? []).map((item) => ({
        name: item.name,
        description: item.description,
        source: toSourceRef(item.page),
      })),
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
        page_from: nullablePage(topic.page_from),
        page_to: nullablePage(topic.page_to),
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

/**
 * Üretim kaynağını seçer: mümkünse damıtılmış çalışma seti, yoksa ham metin.
 * Admin `generation_from_study_set` ayarıyla bunu kapatabilir.
 */
async function loadGenerationSource(
  profile: Profile,
  documentId: string,
): Promise<{ text: string; title: string; source: "digest" | "raw" }> {
  const settings = await getSettings();

  if (settings.generation_from_study_set) {
    const digest = await loadStudyDigest(documentId);
    if (digest) {
      return { text: digest.digest, title: digest.title, source: "digest" };
    }
  }

  const budget = await analysisTokenBudget(profile);
  const raw = await loadDocumentText(documentId, budget);
  return { ...raw, source: "raw" };
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
  const { text, title, source } = await loadGenerationSource(
    params.profile,
    params.documentId,
  );

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
        content: `Materyal adı: ${title}\nÜretilecek kart sayısı: ${params.count}${focus}\n\n${source === "digest" ? "MATERYALİN ANALİZ ÇIKTISI" : "MATERYAL İÇERİĞİ"}:\n\n${text}`,
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
  const { text, title, source } = await loadGenerationSource(
    params.profile,
    params.documentId,
  );

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
        content: `Materyal adı: ${title}\nSoru sayısı: ${params.count}\nGenel zorluk: ${params.difficulty ?? "medium"}\n${typeInstruction}${focus}\n\n${source === "digest" ? "MATERYALİN ANALİZ ÇIKTISI" : "MATERYAL İÇERİĞİ"}:\n\n${text}`,
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
