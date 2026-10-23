// Punto único para elegir proveedor y traducir niveles. Para añadir Anthropic API, Google, etc.,
// se crea un archivo nuevo que implemente ChatProvider y se registra aquí: la interfaz no cambia.
import { claudeReasoningConfig, createClaudeLocalProvider } from "./claude-local";
import { createOpenAIProvider, openaiModel, openaiReasoningConfig } from "./openai";
import type { ReasoningLevel } from "./reasoning";
import { ProviderError, type ChatProvider } from "./types";

export type ProviderId = "openai" | "claude-local";

export function providerId(): ProviderId {
  return process.env.CHAT_PROVIDER === "claude" ? "claude-local" : "openai";
}

export function getProvider(): ChatProvider {
  if (providerId() === "claude-local") {
    if (process.env.NODE_ENV === "production") {
      throw new ProviderError("Claude local solo está disponible en desarrollo.", "claude-local en producción");
    }
    return createClaudeLocalProvider();
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new ProviderError("Falta OPENAI_API_KEY en web/.env.local. Tocorito no puede responder sin ella.", "sin clave");
  return createOpenAIProvider(key);
}

/** Configuración concreta que usará el proveedor para un nivel (útil para depurar y para costes). */
export function getReasoningConfig(provider: ProviderId, level: ReasoningLevel): Record<string, unknown> {
  if (provider === "claude-local") return claudeReasoningConfig(level);
  const model = openaiModel(level);
  return { model, ...openaiReasoningConfig(model, level) };
}
