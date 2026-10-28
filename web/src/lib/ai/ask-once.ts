// Pregunta suelta a la IA (sin streaming hacia el navegador): junta todo el texto y lo devuelve.
// Para generar lecciones y pruebas de Focus. No usa los procesos pre-calentados del chat.
import type { ReasoningLevel } from "./reasoning";
import type { ChatProvider } from "./types";

export type AskUsage = { calls: number; inputTokens: number; outputTokens: number; ms: number };

type AskOpts = { system: string; prompt: string; level: ReasoningLevel; signal?: AbortSignal };

/** Igual que askOnce, pero también devuelve el uso medido (tokens si el proveedor los informa, y tiempo). */
export async function askOnceWithUsage(provider: ChatProvider, { system, prompt, level, signal }: AskOpts): Promise<{ text: string; usage: AskUsage }> {
  const started = Date.now();
  let text = "";
  const usage: AskUsage = { calls: 1, inputTokens: 0, outputTokens: 0, ms: 0 };
  for await (const ev of provider.stream({ system, context: "", messages: [{ role: "user", content: prompt }], level, oneOff: true, signal })) {
    if (ev.type === "text") text += ev.delta;
    if (ev.type === "usage") {
      usage.inputTokens += ev.inputTokens ?? 0;
      usage.outputTokens += ev.outputTokens ?? 0;
    }
  }
  usage.ms = Date.now() - started;
  return { text, usage };
}

export async function askOnce(provider: ChatProvider, opts: AskOpts): Promise<string> {
  return (await askOnceWithUsage(provider, opts)).text;
}
