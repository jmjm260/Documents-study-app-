// Proveedor OpenAI con streaming (Chat Completions, SSE). Sin SDK: solo fetch.
// Los modelos de razonamiento (gpt-5*, o*) aceptan `reasoning_effort`; los demás no.
import type { ChatMessage } from "../chat";
import type { ReasoningLevel } from "./reasoning";
import { ProviderError, type ChatProvider, type ChatRequest, type LevelSupport, type ProviderEvent } from "./types";

const EFFORT: Record<ReasoningLevel, string> = { instant: "minimal", medium: "medium", high: "high" };

export function supportsReasoning(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

/** Modelo por nivel, configurable con variables de entorno sin tocar código. */
export function openaiModel(level: ReasoningLevel): string {
  const perLevel = { instant: process.env.OPENAI_MODEL_INSTANT, medium: process.env.OPENAI_MODEL_MEDIUM, high: process.env.OPENAI_MODEL_HIGH }[level];
  return perLevel || process.env.OPENAI_MODEL || "gpt-5-mini";
}

/** Traduce el nivel al cuerpo de la petición de OpenAI. */
export function openaiReasoningConfig(model: string, level: ReasoningLevel): Record<string, unknown> {
  if (!supportsReasoning(model)) return { max_completion_tokens: 600 };
  // El presupuesto incluye los tokens de razonamiento internos, no solo la respuesta visible.
  const budget = { instant: 1000, medium: 4000, high: 12000 }[level];
  return { reasoning_effort: EFFORT[level], max_completion_tokens: budget };
}

function friendlyError(status: number, code: string | null): string {
  if (code === "insufficient_quota" || code === "credit_balance_exhausted") return "La cuenta de OpenAI no tiene saldo. Añade crédito en platform.openai.com → Billing.";
  if (status === 401) return "La clave de OpenAI no es válida. Revisa OPENAI_API_KEY en web/.env.local.";
  if (code === "model_not_found") return "El modelo configurado no existe en tu cuenta. Revisa OPENAI_MODEL.";
  if (status === 429) return "Tocorito está atendiendo a demasiada gente. Espera un momento ☕";
  return "Tocorito no pudo responder ahora. Inténtalo de nuevo.";
}

/** Mensaje con fotos → partes de texto + imagen (formato de visión de OpenAI). */
export function toOpenAIMessage(m: ChatMessage) {
  if (!m.images?.length) return { role: m.role, content: m.content };
  return {
    role: m.role,
    content: [{ type: "text", text: m.content }, ...m.images.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } }))],
  };
}

export function createOpenAIProvider(apiKey: string): ChatProvider {
  return {
    id: "openai",
    levels(): LevelSupport[] {
      return (["instant", "medium", "high"] as const).map((level) => {
        const model = openaiModel(level);
        return { level, model, realReasoning: supportsReasoning(model) };
      });
    },
    async *stream(req: ChatRequest): AsyncGenerator<ProviderEvent> {
      const model = openaiModel(req.level);
      const system = req.context ? `${req.system}\n\n${req.context}` : req.system;
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, ...req.messages.map(toOpenAIMessage)],
          stream: true,
          stream_options: { include_usage: true },
          ...openaiReasoningConfig(model, req.level),
        }),
        signal: req.signal ?? AbortSignal.timeout(120_000),
      }).catch((e: Error) => {
        throw new ProviderError("No pude conectar con OpenAI. Revisa tu conexión.", e.message);
      });
      if (!res.ok || !res.body) {
        // Solo usamos el código de error (p. ej. "insufficient_quota"), no el mensaje completo.
        const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code ?? null;
        throw new ProviderError(friendlyError(res.status, code), `OpenAI respondió ${res.status}${code ? ` (${code})` : ""}`);
      }

      if (supportsReasoning(model) && req.level !== "instant") yield { type: "status", status: "thinking" };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let generating = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          let chunk: { choices?: { delta?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            if (!generating) {
              generating = true;
              yield { type: "status", status: "generating" };
            }
            yield { type: "text", delta };
          }
          if (chunk.usage) {
            yield { type: "usage", inputTokens: chunk.usage.prompt_tokens ?? null, outputTokens: chunk.usage.completion_tokens ?? null };
          }
        }
      }
    },
  };
}
