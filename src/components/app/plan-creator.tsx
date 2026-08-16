"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, Input, Label, Select } from "@/components/ui";
import { UpgradeDialog } from "@/components/app/upgrade-dialog";
import { ApiError, apiFetch, type UpgradeInfo } from "@/lib/client/api";

const DAILY_MINUTES = [30, 45, 60, 90, 120, 180, 240];

export function PlanCreator({
  documents,
  defaultDailyMinutes,
}: {
  documents: { id: string; title: string }[];
  defaultDailyMinutes: number;
}) {
  const router = useRouter();
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(String(defaultDailyMinutes));
  const [selected, setSelected] = useState<string[]>(
    documents.slice(0, 3).map((doc) => doc.id),
  );
  // Yarından itibaren seçilebilsin; render sırasında saat okumamak için lazy init.
  const [minExamDate] = useState(() =>
    new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState<{ info: UpgradeInfo; message: string } | null>(
    null,
  );

  async function create() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/plan", {
        json: {
          examName,
          examDate,
          dailyMinutes: Number(dailyMinutes),
          documentIds: selected,
        },
      });
      setExamName("");
      setExamDate("");
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.upgrade) {
          setUpgrade({ info: caught.upgrade, message: caught.message });
        } else {
          setError(caught.message);
        }
      } else {
        setError("Plan oluşturulamadı.");
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !loading && examName.trim().length > 1 && examDate && selected.length > 0;

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="plan-exam">Sınav adı</Label>
              <Input
                id="plan-exam"
                value={examName}
                onChange={(event) => setExamName(event.target.value)}
                placeholder="Örn: Biyoloji Final"
              />
            </div>
            <div>
              <Label htmlFor="plan-date">Sınav tarihi</Label>
              <Input
                id="plan-date"
                type="date"
                value={examDate}
                min={minExamDate}
                onChange={(event) => setExamDate(event.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="plan-minutes">Günlük çalışma süresi</Label>
            <Select
              id="plan-minutes"
              value={dailyMinutes}
              onChange={(event) => setDailyMinutes(event.target.value)}
            >
              {DAILY_MINUTES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} dakika
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Materyaller</Label>
            <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-line p-3">
              {documents.map((doc) => (
                <label
                  key={doc.id}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(doc.id)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...current, doc.id]
                          : current.filter((id) => id !== doc.id),
                      )
                    }
                    className="size-4 rounded border-line text-brand-600 focus:ring-brand-400"
                  />
                  <span className="truncate">{doc.title}</span>
                </label>
              ))}
            </div>
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Button block loading={loading} disabled={!canSubmit} onClick={create}>
            <CalendarClock aria-hidden />
            Planımı oluştur
          </Button>
        </CardContent>
      </Card>

      {upgrade ? (
        <UpgradeDialog
          info={upgrade.info}
          message={upgrade.message}
          onClose={() => setUpgrade(null)}
        />
      ) : null}
    </>
  );
}
