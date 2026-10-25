// Pregunta suelta a la IA (sin streaming hacia el navegador): junta todo el texto y lo devuelve.
// Para generar lecciones y pruebas de Focus. No usa los procesos pre-calentados del chat.
import type { ReasoningLevel } from "./reasoning";
import type { ChatProvider } from "./types";

export async function askOnce(
  provider: ChatProvider,
  { system, prompt, level, signal }: { system: string; prompt: string; level: ReasoningLevel; signal?: AbortSignal }
): Promise<string> {
  let raw = "";
  for await (const ev of provider.stream({ system, context: "", messages: [{ role: "user", content: prompt }], level, oneOff: true, signal })) {
    if (ev.type === "text") raw += ev.delta;
  }
  return raw;
}
