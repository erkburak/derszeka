"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/client/api";

export function RetryProcessing({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/api/documents/${documentId}`, { method: "POST" });
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "İşlem başlatılamadı.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={retry} loading={loading} variant="secondary">
        <RefreshCw aria-hidden />
        Tekrar dene
      </Button>
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
    </div>
  );
}
