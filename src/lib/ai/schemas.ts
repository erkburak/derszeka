import type { JsonSchemaSpec } from "@/lib/ai/provider";

/**
 * Yapılandırılmış çıktı şemaları. Strict mod için her nesnede
 * `additionalProperties: false` ve tüm alanların `required` olması gerekir.
 */
function obj(
  properties: Record<string, unknown>,
  required?: string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: required ?? Object.keys(properties),
    additionalProperties: false,
  };
}

const str = (description: string) => ({ type: "string", description });
const arr = (items: unknown, description: string) => ({
  type: "array",
  items,
  description,
});

const sourceRef = obj({
  page: { type: ["integer", "null"], description: "Kaynak sayfa numarası" },
  section: { type: ["string", "null"], description: "Kaynak bölüm başlığı" },
});

/**
 * Çalışma seti şeması bilinçli olarak "düz" tutuldu: iç içe kaynak nesnesi ve
 * nullable birleşim tipleri yerine düz `page`/`section` alanları kullanılıyor.
 * İç içe hâli, structured outputs'un derlediği gramerin boyut sınırını aşıyor
 * ve API 400 döndürüyor ("compiled grammar is too large").
 * Bilinmeyen sayfa 0, bilinmeyen bölüm boş metin olarak gelir.
 */
const pageField = { type: "integer", description: "Kaynak sayfa; bilinmiyorsa 0" };
const sectionField = str("Kaynak bölüm başlığı; bilinmiyorsa boş bırak");

export const studySetSchema: JsonSchemaSpec = {
  name: "study_set",
  schema: obj({
    title: str("Materyalin konusunu özetleyen kısa başlık"),
    language: str("Materyalin dili, ISO kodu (tr, en...)"),
    summary_short: str("3-5 cümlelik kısa özet"),
    summary_detailed: str("Markdown biçiminde detaylı özet"),
    section_summaries: arr(
      obj({
        title: str("Bölüm başlığı"),
        content: str("Bölümün özeti"),
        page: pageField,
      }),
      "Bölüm bölüm özetler",
    ),
    key_points: arr(
      obj({ text: str("Önemli bilgi"), page: pageField, section: sectionField }),
      "En önemli bilgiler",
    ),
    exam_critical: arr(
      obj({
        text: str("Sınavda çıkma ihtimali yüksek bilgi"),
        page: pageField,
        section: sectionField,
      }),
      "Sınav açısından kritik bilgiler",
    ),
    definitions: arr(
      obj({ term: str("Kavram"), definition: str("Tanımı"), page: pageField }),
      "Tanımlar",
    ),
    formulas: arr(
      obj({
        name: str("Formülün adı"),
        expression: str("Formül, düz metin"),
        explanation: str("Ne işe yaradığı"),
        page: pageField,
      }),
      "Formüller (yoksa boş dizi)",
    ),
    dates: arr(
      obj({ date: str("Tarih"), event: str("Olay"), page: pageField }),
      "Tarihler (yoksa boş dizi)",
    ),
    names: arr(
      obj({ name: str("Kişi/kurum adı"), description: str("Önemi"), page: pageField }),
      "İsimler (yoksa boş dizi)",
    ),
    comparisons: arr(
      obj({
        title: str("Karşılaştırmanın konusu"),
        left: str("Birinci taraf"),
        right: str("İkinci taraf"),
        difference: str("Temel fark"),
      }),
      "Karşılaştırmalar",
    ),
    cause_effects: arr(
      obj({ cause: str("Sebep"), effect: str("Sonuç") }),
      "Sebep-sonuç ilişkileri",
    ),
    topics: arr(
      obj({
        title: str("Konu başlığı"),
        description: str("Konunun kısa açıklaması"),
        importance: {
          type: "integer",
          description: "1 (düşük) - 5 (kritik) önem derecesi",
        },
        page_from: { type: "integer", description: "Başlangıç sayfası; bilinmiyorsa 0" },
        page_to: { type: "integer", description: "Bitiş sayfası; bilinmiyorsa 0" },
        subtopics: arr(str("Alt konu başlığı"), "Alt konular"),
      }),
      "Konu hiyerarşisi",
    ),
  }),
};

export const flashcardsSchema: JsonSchemaSpec = {
  name: "flashcards",
  schema: obj({
    cards: arr(
      obj({
        front: str("Soru veya kavram"),
        back: str("Cevap veya açıklama"),
        hint: str("Kısa ipucu, gerekmiyorsa boş metin"),
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard", "very_hard"],
          description: "Zorluk seviyesi",
        },
        topic: str("İlgili konu başlığı"),
        source: sourceRef,
      }),
      "Üretilen flashcardlar",
    ),
  }),
};

export const quizSchema: JsonSchemaSpec = {
  name: "quiz",
  schema: obj({
    title: str("Quiz başlığı"),
    questions: arr(
      obj({
        q_type: {
          type: "string",
          enum: [
            "multiple_choice",
            "true_false",
            "fill_blank",
            "matching",
            "short_answer",
            "open_ended",
          ],
          description: "Soru tipi",
        },
        prompt: str("Soru metni"),
        options: arr(
          str("Seçenek metni"),
          "Çoktan seçmeli için şıklar, doğru/yanlış için ['Doğru','Yanlış'], eşleştirme için sağ taraf; diğerlerinde boş dizi",
        ),
        correct_answer: str(
          "Doğru cevap. Çoktan seçmelide şıkkın tam metni; eşleştirmede 'sol=sağ' satırları; diğerlerinde beklenen cevap",
        ),
        explanation: str("Cevabın neden doğru olduğunun açıklaması"),
        difficulty: {
          type: "string",
          enum: ["easy", "medium", "hard", "very_hard"],
          description: "Zorluk seviyesi",
        },
        source: sourceRef,
      }),
      "Sorular",
    ),
  }),
};

export const answerEvaluationSchema: JsonSchemaSpec = {
  name: "answer_evaluation",
  schema: obj({
    is_correct: { type: "boolean", description: "Cevap doğru mu" },
    score: {
      type: "number",
      description: "0 ile 1 arasında kısmi puan",
    },
    feedback: str("Öğrenciye yönelik açıklayıcı geri bildirim"),
    missing_points: arr(str("Eksik kalan bilgi"), "Cevapta eksik olan noktalar"),
  }),
};

export const studyPlanSchema: JsonSchemaSpec = {
  name: "study_plan",
  schema: obj({
    title: str("Plan başlığı"),
    summary: str("Planın mantığını anlatan kısa açıklama"),
    items: arr(
      obj({
        scheduled_date: str("YYYY-MM-DD biçiminde tarih"),
        topic_title: str("Çalışılacak konu"),
        activity: {
          type: "string",
          enum: ["read", "flashcard", "quiz", "review"],
          description: "Etkinlik türü",
        },
        duration_minutes: { type: "integer", description: "Süre (dakika)" },
        order_index: { type: "integer", description: "Gün içindeki sıra" },
      }),
      "Plan maddeleri",
    ),
  }),
};

export const guidedStepSchema: JsonSchemaSpec = {
  name: "guided_step",
  schema: obj({
    phase: {
      type: "string",
      enum: ["teach", "question", "evaluate", "recap", "finished"],
      description: "Bu adımın türü",
    },
    message: str("Öğrenciye gösterilecek metin (Markdown)"),
    question: str("Öğrenciye sorulan soru; yoksa boş metin"),
    options: arr(str("Şık"), "Çoktan seçmeli ise şıklar, değilse boş dizi"),
    expected_answer: str("Beklenen cevap; soru yoksa boş metin"),
    evaluation: obj({
      was_correct: { type: "boolean", description: "Önceki cevap doğru muydu" },
      feedback: str("Önceki cevaba dair geri bildirim; ilk adımda boş"),
    }),
    difficulty_delta: {
      type: "integer",
      description: "Sonraki soru için zorluk değişimi: -1, 0 veya 1",
    },
    progress: { type: "integer", description: "0-100 arası tamamlanma yüzdesi" },
    citations: arr(sourceRef, "Kullanılan kaynaklar"),
  }),
};
