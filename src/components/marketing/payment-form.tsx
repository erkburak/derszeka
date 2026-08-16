"use client";

import { useState } from "react";
import { CheckCircle2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, Input, Label, Textarea } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/client/api";

export function PaymentForm({
  defaultName,
  defaultEmail,
  amount,
  currency,
}: {
  defaultName: string;
  defaultEmail: string;
  amount: number;
  currency: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiFetch("/api/payments", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      setDone(true);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Bildirim gönderilemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <Card>
        <CardContent className="space-y-3 p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success-500" aria-hidden />
          <h3 className="text-lg font-semibold text-ink-900">Bildirimin alındı</h3>
          <p className="text-sm text-ink-500">
            Ödemen kontrol edildikten sonra Premium üyeliğin aktifleşecek ve sana
            bildirim göndereceğiz. Bu genellikle birkaç saat içinde tamamlanır.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
          <Receipt className="size-5 text-brand-600" aria-hidden />
          Ödeme Bildir
        </h3>
        <p className="mt-1 mb-5 text-sm text-ink-500">
          Havale/EFT yaptıktan sonra bu formu doldur.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="pf-name">Ad Soyad</Label>
            <Input
              id="pf-name"
              name="fullName"
              defaultValue={defaultName}
              required
              minLength={3}
            />
          </div>

          <div>
            <Label htmlFor="pf-email">E-posta</Label>
            <Input
              id="pf-email"
              name="email"
              type="email"
              defaultValue={defaultEmail}
              required
            />
          </div>

          <div>
            <Label htmlFor="pf-amount">Tutar ({currency})</Label>
            <Input
              id="pf-amount"
              name="amount"
              type="number"
              step="0.01"
              min="1"
              defaultValue={amount}
              required
            />
          </div>

          <div>
            <Label htmlFor="pf-receipt">Dekont (JPG, PNG, WEBP veya PDF)</Label>
            <input
              id="pf-receipt"
              name="receipt"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>

          <div>
            <Label htmlFor="pf-note">Açıklama (opsiyonel)</Label>
            <Textarea
              id="pf-note"
              name="note"
              rows={3}
              placeholder="Ödeme yaptığın banka, tarih veya referans numarası"
            />
          </div>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Button type="submit" block size="lg" loading={loading}>
            Ödemeyi bildir
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
