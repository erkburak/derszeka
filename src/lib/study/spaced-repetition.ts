import type { CardResult } from "@/lib/types";

export interface SRSState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface SRSResult extends SRSState {
  dueAt: Date;
}

/** SM-2'nin 0-5 kalite ölçeğine üç butonlu arayüzü eşler. */
const QUALITY: Record<CardResult, number> = {
  known: 5,
  unsure: 3,
  unknown: 1,
};

/**
 * SM-2 türevi aralıklı tekrar. Zorlanılan kartlar aynı gün içinde
 * tekrar öne çıkar; iyi bilinen kartların aralığı katlanarak uzar.
 */
export function scheduleNextReview(
  state: SRSState,
  result: CardResult,
  now: Date = new Date(),
): SRSResult {
  const quality = QUALITY[result];
  let { easeFactor, intervalDays, repetitions, lapses } = state;

  if (quality < 3) {
    // Bilinmeyen kart: seriyi sıfırla, 10 dakika sonra tekrar sor.
    repetitions = 0;
    lapses += 1;
    intervalDays = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    return {
      easeFactor,
      intervalDays,
      repetitions,
      lapses,
      dueAt: new Date(now.getTime() + 10 * 60_000),
    };
  }

  repetitions += 1;
  easeFactor = Math.max(
    1.3,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = quality === 5 ? 4 : 3;
  else intervalDays = Math.round(Math.max(1, intervalDays) * easeFactor);

  // "Emin değilim" cevabı aralığı kısaltır.
  if (quality === 3) intervalDays = Math.max(1, Math.round(intervalDays * 0.6));

  intervalDays = Math.min(intervalDays, 180);

  return {
    easeFactor: Number(easeFactor.toFixed(2)),
    intervalDays,
    repetitions,
    lapses,
    dueAt: new Date(now.getTime() + intervalDays * 86_400_000),
  };
}

export const DEFAULT_SRS_STATE: SRSState = {
  easeFactor: 2.5,
  intervalDays: 0,
  repetitions: 0,
  lapses: 0,
};

/** Konu hakimiyetini doğru/yanlış oranından yumuşatılmış şekilde hesaplar. */
export function computeMastery(correct: number, wrong: number): number {
  const total = correct + wrong;
  if (total === 0) return 0;
  // Laplace düzeltmesi: az denemede aşırı iyimser/kötümser sonuç vermez.
  return Number(((correct + 1) / (total + 2)).toFixed(4));
}
