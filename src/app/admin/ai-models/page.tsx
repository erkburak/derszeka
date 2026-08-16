import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  deleteAIModelAction,
  updateProviderKeyAction,
  upsertAIModelAction,
} from "@/app/admin/actions";
import type { AIModelRow } from "@/lib/types";

export const metadata = { title: "AI Modelleri" };
export const dynamic = "force-dynamic";

const PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google Gemini" },
];

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-line text-brand-600 focus:ring-brand-400"
      />
      {label}
    </label>
  );
}

function ModelForm({ model }: { model?: AIModelRow }) {
  return (
    <form action={upsertAIModelAction} className="space-y-4">
      {model ? <input type="hidden" name="id" value={model.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`provider-${model?.id ?? "new"}`}>Sağlayıcı</Label>
          <Select
            id={`provider-${model?.id ?? "new"}`}
            name="provider"
            defaultValue={model?.provider ?? "anthropic"}
          >
            {PROVIDERS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor={`purpose-${model?.id ?? "new"}`}>Amaç</Label>
          <Select
            id={`purpose-${model?.id ?? "new"}`}
            name="purpose"
            defaultValue={model?.purpose ?? "chat"}
          >
            <option value="chat">Sohbet / üretim</option>
            <option value="embedding">Embedding</option>
            <option value="vision">Görsel</option>
          </Select>
        </div>

        <div>
          <Label htmlFor={`modelKey-${model?.id ?? "new"}`}>Model ID</Label>
          <Input
            id={`modelKey-${model?.id ?? "new"}`}
            name="modelKey"
            defaultValue={model?.model_key}
            placeholder="claude-opus-5"
            required
          />
        </div>

        <div>
          <Label htmlFor={`displayName-${model?.id ?? "new"}`}>Görünen ad</Label>
          <Input
            id={`displayName-${model?.id ?? "new"}`}
            name="displayName"
            defaultValue={model?.display_name}
            placeholder="Claude Opus 5"
            required
          />
        </div>

        <div>
          <Label htmlFor={`inputPrice-${model?.id ?? "new"}`}>
            Input fiyatı (USD / 1M token)
          </Label>
          <Input
            id={`inputPrice-${model?.id ?? "new"}`}
            name="inputPrice"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={model?.input_price_per_1m ?? 0}
          />
        </div>

        <div>
          <Label htmlFor={`outputPrice-${model?.id ?? "new"}`}>
            Output fiyatı (USD / 1M token)
          </Label>
          <Input
            id={`outputPrice-${model?.id ?? "new"}`}
            name="outputPrice"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={model?.output_price_per_1m ?? 0}
          />
        </div>

        <div>
          <Label htmlFor={`maxInputTokens-${model?.id ?? "new"}`}>
            Maks. context
          </Label>
          <Input
            id={`maxInputTokens-${model?.id ?? "new"}`}
            name="maxInputTokens"
            type="number"
            min="1000"
            defaultValue={model?.max_input_tokens ?? 200000}
          />
        </div>

        <div>
          <Label htmlFor={`maxOutputTokens-${model?.id ?? "new"}`}>
            Maks. çıktı tokeni
          </Label>
          <Input
            id={`maxOutputTokens-${model?.id ?? "new"}`}
            name="maxOutputTokens"
            type="number"
            min="256"
            defaultValue={model?.max_output_tokens ?? 8192}
          />
        </div>

        <div>
          <Label htmlFor={`priority-${model?.id ?? "new"}`}>Öncelik</Label>
          <Input
            id={`priority-${model?.id ?? "new"}`}
            name="priority"
            type="number"
            defaultValue={model?.priority ?? 100}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox name="isActive" label="Aktif" defaultChecked={model?.is_active ?? true} />
        <Checkbox
          name="isDefault"
          label="Varsayılan"
          defaultChecked={model?.is_default ?? false}
        />
        <Checkbox
          name="requiresPremium"
          label="Sadece Premium"
          defaultChecked={model?.requires_premium ?? false}
        />
        <Checkbox
          name="supportsVision"
          label="Görsel destekler"
          defaultChecked={model?.supports_vision ?? false}
        />
        <Checkbox
          name="supportsPdf"
          label="PDF destekler"
          defaultChecked={model?.supports_pdf ?? false}
        />
      </div>

      <Button type="submit" size="sm">
        {model ? "Modeli güncelle" : "Modeli ekle"}
      </Button>
    </form>
  );
}

export default async function AdminAIModelsPage() {
  await requireAdmin();
  const supabase = createAdminSupabase();

  const [{ data: models }, { data: providers }] = await Promise.all([
    supabase
      .from("ai_models")
      .select("*")
      .order("purpose", { ascending: true })
      .order("priority", { ascending: true }),
    supabase
      .from("ai_providers")
      .select("provider, display_name, is_enabled, api_key_hint, base_url")
      .order("provider", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          AI Modelleri
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Sağlayıcı anahtarları, aktif modeller ve token fiyatları.
        </p>
      </div>

      <Alert tone="brand">
        API anahtarları veritabanında şifreli saklanır ve hiçbir zaman tarayıcıya
        gönderilmez. Alan boş bırakılırsa mevcut anahtar korunur.
      </Alert>

      {/* Sağlayıcılar */}
      <div className="grid gap-4 lg:grid-cols-3">
        {(providers ?? []).map((provider) => (
          <Card key={provider.provider}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-brand-600" aria-hidden />
                {provider.display_name}
              </CardTitle>
              <Badge tone={provider.is_enabled ? "success" : "neutral"}>
                {provider.is_enabled ? "Açık" : "Kapalı"}
              </Badge>
            </CardHeader>
            <CardContent>
              <form action={updateProviderKeyAction} className="space-y-3">
                <input type="hidden" name="provider" value={provider.provider} />

                <div>
                  <Label htmlFor={`key-${provider.provider}`}>API anahtarı</Label>
                  <Input
                    id={`key-${provider.provider}`}
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      provider.api_key_hint
                        ? `Kayıtlı: ${provider.api_key_hint}`
                        : "Anahtar girilmemiş"
                    }
                  />
                </div>

                <div>
                  <Label htmlFor={`baseUrl-${provider.provider}`}>
                    Base URL (opsiyonel)
                  </Label>
                  <Input
                    id={`baseUrl-${provider.provider}`}
                    name="baseUrl"
                    defaultValue={provider.base_url ?? ""}
                    placeholder="Varsayılan"
                  />
                </div>

                <Checkbox
                  name="isEnabled"
                  label="Sağlayıcı aktif"
                  defaultChecked={provider.is_enabled}
                />

                <Button type="submit" size="sm" variant="secondary" block>
                  Kaydet
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Yeni model */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-4 text-brand-600" aria-hidden />
            Yeni model ekle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ModelForm />
        </CardContent>
      </Card>

      {/* Mevcut modeller */}
      <div className="space-y-4">
        {((models ?? []) as AIModelRow[]).map((model) => (
          <Card key={model.id}>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{model.display_name}</CardTitle>
                <Badge tone="neutral">{model.model_key}</Badge>
                <Badge tone="neutral">{model.purpose}</Badge>
                {model.is_default ? <Badge tone="brand">Varsayılan</Badge> : null}
                {model.requires_premium ? (
                  <Badge tone="warning">Premium</Badge>
                ) : null}
                <Badge tone={model.is_active ? "success" : "danger"}>
                  {model.is_active ? "Aktif" : "Pasif"}
                </Badge>
              </div>

              <form action={deleteAIModelAction}>
                <input type="hidden" name="id" value={model.id} />
                <Button type="submit" size="sm" variant="ghost">
                  <Trash2 className="text-danger-500" aria-hidden />
                </Button>
              </form>
            </CardHeader>
            <CardContent>
              <ModelForm model={model} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
