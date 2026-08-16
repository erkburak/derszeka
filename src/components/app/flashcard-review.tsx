"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, HelpCircle, Lightbulb, Quote, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, Progress } from "@/components/ui";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";
import type { CardResult, Flashcard } from "@/lib/types";

const DIFFICULTY_LABEL: Record<string, string> = {
  easy: "Kolay",
  medium: "Orta",
  hard: "Zor",
  very_hard: "Çok zor",
};

const ACTIONS: {
  result: CardResult;
  label: string;
  icon: typeof Check;
  variant: "success" | "secondary" | "danger";
}[] = [
  { result: "unknown", label: "Bilmiyorum", icon: X, variant: "danger" },
  { result: "unsure", label: "Emin değilim", icon: HelpCircle, variant: "secondary" },
  { result: "known", label: "Biliyorum", icon: Check, variant: "success" },
];

export function FlashcardReview({ cards }: { cards: Flashcard[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<CardResult, number>>({
    known: 0,
    unsure: 0,
    unknown: 0,
  });
  const shownAt = useRef(Date.now());

  const card = cards[index];
  const finished = index >= cards.length;
  const total = cards.length;

  const accuracy = useMemo(() => {
    const answered = results.known + results.unsure + results.unknown;
    return answered > 0 ? Math.round((results.known / answered) * 100) : 0;
  }, [results]);

  // Klavye kısayolları: boşluk çevirir, 1-2-3 değerlendirir.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (finished || saving) return;
      if (event.code === "Space") {
        event.preventDefault();
        setFlipped((value) => !value);
        return;
      }
      if (!flipped) return;
      const map: Record<string, CardResult> = {
        Digit1: "unknown",
        Digit2: "unsure",
        Digit3: "known",
      };
      const result = map[event.code];
      if (result) {
        event.preventDefault();
        void review(result);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function review(result: CardResult) {
    if (!card || saving) return;
    setSaving(true);
    try {
      await apiFetch("/api/flashcards/review", {
        json: {
          flashcardId: card.id,
          result,
          responseMs: Date.now() - shownAt.current,
        },
      });
      setResults((current) => ({ ...current, [result]: current[result] + 1 }));
    } catch {
      // Kaydedilemese bile kullanıcı akışını kesme; sıradaki karta geç.
    } finally {
      goToNextCard();
      setSaving(false);
    }
  }

  function goToNextCard() {
    setIndex((value) => value + 1);
    setFlipped(false);
    setShowHint(false);
    shownAt.current = Date.now();
  }

  function restart() {
    setIndex(0);
    setFlipped(false);
    setShowHint(false);
    setResults({ known: 0, unsure: 0, unknown: 0 });
    shownAt.current = Date.now();
  }

  if (total === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-ink-500">Şu an tekrar edilecek kartın yok.</p>
        </CardContent>
      </Card>
    );
  }

  if (finished) {
    return (
      <Card>
        <CardContent className="space-y-5 p-8 text-center">
          <div className="gradient-brand mx-auto flex size-14 items-center justify-center rounded-2xl text-white">
            <Check className="size-7" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-ink-900">Seansı tamamladın!</h2>
            <p className="mt-1 text-sm text-ink-500">
              {total} kartı gözden geçirdin. Başarı oranın %{accuracy}.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-success-50 p-3">
              <p className="text-2xl font-semibold text-success-700">{results.known}</p>
              <p className="text-xs text-success-700">Biliyorum</p>
            </div>
            <div className="rounded-xl bg-surface-sunken p-3">
              <p className="text-2xl font-semibold text-ink-700">{results.unsure}</p>
              <p className="text-xs text-ink-500">Emin değilim</p>
            </div>
            <div className="rounded-xl bg-danger-50 p-3">
              <p className="text-2xl font-semibold text-danger-700">{results.unknown}</p>
              <p className="text-xs text-danger-700">Bilmiyorum</p>
            </div>
          </div>

          <p className="text-xs text-ink-400">
            Zorlandığın kartlar aralıklı tekrar sistemine göre yeniden karşına çıkacak.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={restart} variant="secondary">
              <RotateCcw aria-hidden />
              Baştan çalış
            </Button>
            <Button onClick={() => router.push("/dashboard")}>Panele dön</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-500">
          {index + 1} / {total}
        </span>
        <Badge tone="neutral">
          {DIFFICULTY_LABEL[card!.difficulty] ?? card!.difficulty}
        </Badge>
      </div>

      <Progress value={((index + 1) / total) * 100} />

      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        className={cn(
          "card flex min-h-64 w-full cursor-pointer flex-col items-center justify-center p-8 text-center transition-all",
          flipped ? "bg-brand-50" : "bg-white",
        )}
        aria-label="Kartı çevir"
      >
        <span className="mb-3 text-xs font-medium tracking-wide text-ink-400 uppercase">
          {flipped ? "Cevap" : "Soru"}
        </span>
        <p className="text-lg leading-relaxed font-medium text-ink-900">
          {flipped ? card!.back : card!.front}
        </p>

        {!flipped && showHint && card!.hint ? (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-warning-700">
            <Lightbulb className="size-4" aria-hidden />
            {card!.hint}
          </p>
        ) : null}

        {flipped && (card!.source_ref?.page || card!.source_ref?.section) ? (
          <span className="mt-4 inline-flex items-center gap-1 text-xs text-brand-600">
            <Quote className="size-3" aria-hidden />
            Kaynak: {card!.source_ref.section ?? ""}
            {card!.source_ref.section && card!.source_ref.page ? " · " : ""}
            {card!.source_ref.page ? `Sayfa ${card!.source_ref.page}` : ""}
          </span>
        ) : null}

        <span className="mt-6 text-xs text-ink-400">
          {flipped ? "Tekrar çevirmek için tıkla" : "Cevabı görmek için tıkla (boşluk)"}
        </span>
      </button>

      {!flipped && card!.hint ? (
        <Button variant="ghost" size="sm" onClick={() => setShowHint(true)} block>
          <Lightbulb aria-hidden />
          İpucu göster
        </Button>
      ) : null}

      {flipped ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ACTIONS.map((action, actionIndex) => (
            <Button
              key={action.result}
              variant={action.variant}
              onClick={() => review(action.result)}
              disabled={saving}
              block
            >
              <action.icon aria-hidden />
              {action.label}
              <span className="ml-1 text-xs opacity-60">{actionIndex + 1}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
