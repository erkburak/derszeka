import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { runStructured } from "@/lib/ai/service";
import { studyPlanPrompt } from "@/lib/ai/prompts";
import { studyPlanSchema } from "@/lib/ai/schemas";
import { hasFeature } from "@/lib/limits";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Body {
  title?: string;
  examName: string;
  examDate: string;
  dailyMinutes: number;
  documentIds: string[];
}

interface PlanPayload {
  title: string;
  summary: string;
  items: {
    scheduled_date: string;
    topic_title: string;
    activity: "read" | "flashcard" | "quiz" | "review";
    duration_minutes: number;
    order_index: number;
  }[];
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  if (!(await hasFeature(profile.plan, "feature_study_plan"))) {
    throw new AppError(
      "Kişisel çalışma planı Premium özelliğidir.",
      402,
      "feature_unavailable",
    );
  }

  const body = await readJson<Body>(request);
  const examDate = new Date(body.examDate);

  if (Number.isNaN(examDate.getTime())) {
    throw new AppError("Geçerli bir sınav tarihi seç.", 400, "invalid_date");
  }
  const daysLeft = Math.ceil((examDate.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 1) {
    throw new AppError("Sınav tarihi bugünden sonra olmalı.", 400, "invalid_date");
  }
  if (daysLeft > 180) {
    throw new AppError("Sınav tarihi en fazla 180 gün sonrası olabilir.", 400, "invalid_date");
  }
  if (!body.documentIds?.length) {
    throw new AppError("En az bir materyal seçmelisin.", 400, "invalid_request");
  }

  const dailyMinutes = Math.min(Math.max(Number(body.dailyMinutes) || 60, 15), 480);

  const supabase = await createServerSupabase();
  const { data: topics } = await supabase
    .from("topics")
    .select("title, description, importance, document_id")
    .in("document_id", body.documentIds)
    .is("parent_id", null)
    .order("order_index", { ascending: true });

  if (!topics?.length) {
    throw new AppError(
      "Seçtiğin materyaller henüz analiz edilmemiş. İşlem tamamlanınca tekrar dene.",
      409,
      "not_ready",
    );
  }

  const { data: progress } = await supabase
    .from("study_progress")
    .select("topic_id, mastery")
    .in("document_id", body.documentIds);

  const weakTopics = (progress ?? [])
    .filter((row) => Number(row.mastery) < 0.6)
    .length;

  const { data: plan } = await runStructured<PlanPayload>({
    profile,
    operation: "STUDY_PLAN",
    system: studyPlanPrompt,
    jsonSchema: studyPlanSchema,
    maxOutputTokens: 8000,
    messages: [
      {
        role: "user",
        content: [
          `Sınav: ${body.examName}`,
          `Sınav tarihi: ${examDate.toISOString().slice(0, 10)}`,
          `Bugün: ${new Date().toISOString().slice(0, 10)}`,
          `Kalan gün: ${daysLeft}`,
          `Günlük çalışma süresi: ${dailyMinutes} dakika`,
          `Zayıf konu sayısı: ${weakTopics}`,
          "",
          "KONULAR:",
          ...topics.map(
            (topic) =>
              `- ${topic.title} (önem: ${topic.importance}/5)${topic.description ? ` — ${topic.description}` : ""}`,
          ),
        ].join("\n"),
      },
    ],
  });

  const admin = createAdminSupabase();
  const { data: created, error } = await admin
    .from("study_plans")
    .insert({
      user_id: profile.id,
      title: body.title || plan.title || `${body.examName} Planı`,
      exam_name: body.examName,
      exam_date: examDate.toISOString().slice(0, 10),
      daily_minutes: dailyMinutes,
      document_ids: body.documentIds,
    })
    .select("id")
    .single();

  if (error) throw new AppError("Plan kaydedilemedi.", 500, "db_error");

  const items = (plan.items ?? []).filter((item) =>
    /^\d{4}-\d{2}-\d{2}$/.test(item.scheduled_date),
  );

  if (items.length > 0) {
    await admin.from("study_plan_items").insert(
      items.map((item, index) => ({
        plan_id: created.id,
        user_id: profile.id,
        scheduled_date: item.scheduled_date,
        topic_title: item.topic_title,
        document_id: body.documentIds[0] ?? null,
        activity: item.activity,
        duration_minutes: Math.min(Math.max(item.duration_minutes || 30, 5), dailyMinutes),
        order_index: item.order_index ?? index,
      })),
    );
  }

  return NextResponse.json({
    planId: created.id,
    summary: plan.summary,
    itemCount: items.length,
  });
});
