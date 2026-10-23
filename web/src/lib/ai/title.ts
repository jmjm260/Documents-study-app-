// Título corto y automático para cada chat (3-7 palabras), generado por la IA que tenga configurada la app.
import type { ChatMessage } from "../chat";
import type { ChatProvider } from "./types";

export const TITLE_SYSTEM = `Escribes títulos cortos para conversaciones de estudio.
Reglas:
- Entre 3 y 7 palabras, en el idioma de la conversación.
- Describe el tema real (ej.: "Robot Arduino con sensores", "Aprendiendo C++", "Plan de estudio SAT").
- Nada de "Nuevo chat", "Pregunta del usuario", "Conversación" ni copiar el mensaje entero.
- Sin comillas, sin punto final, sin emojis.
- Responde SOLO con el título.`;

const BAD = /^(nuevo chat|chat nuevo|pregunta del usuario|conversaci[oó]n( nueva)?|sin t[ií]tulo)$/i;
const MAX_WORDS = 7;
const MAX_CHARS = 48;

/** Limpia lo que devuelve la IA. Devuelve null si no sirve como título. */
export function cleanTitle(raw: string): string | null {
  let t = raw
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean) ?? "";
  t = t
    .replace(/^(t[ií]tulo|title)\s*:\s*/i, "")
    .replace(/[*_#`"“”«»]/g, "")
    .replace(/[.!¡¿?…:;,]+$/u, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || BAD.test(t)) return null;
  const words = t.split(" ");
  if (words.length > MAX_WORDS) t = words.slice(0, MAX_WORDS).join(" ");
  if (t.length > MAX_CHARS) t = `${t.slice(0, MAX_CHARS - 1).trimEnd()}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Por si la IA falla: las primeras palabras con contenido del primer mensaje. */
export function fallbackTitle(firstUserText: string): string {
  const stop = /^(quiero|que|me|ayudas?|ayudes|puedes|por|favor|hola|oye|a|el|la|los|las|un|una|de|del|y|en|con|para|sobre|explícame|explicame)$/i;
  const words = firstUserText.replace(/[^\p{L}\p{N}\s+#-]/gu, " ").split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !stop.test(w));
  const pick = (meaningful.length >= 2 ? meaningful : words).slice(0, 5).join(" ");
  return cleanTitle(pick) ?? "Chat de estudio";
}

export async function generateTitle(provider: ChatProvider, messages: ChatMessage[]): Promise<string> {
  const firstUser = messages.find((m) => m.role === "user");
  const firstReply = messages.find((m) => m.role === "assistant");
  // Si no hay mensaje del estudiante (chats viejos incompletos), el tema sale de la respuesta.
  const userText = firstUser?.content?.trim() || (firstUser?.images?.length ? "(foto de un ejercicio)" : "") || firstReply?.content?.trim() || "";
  if (!userText) return "Chat de estudio";
  const prompt = `Mensaje del estudiante:\n${userText.slice(0, 1200)}\n\n${
    firstReply ? `Respuesta del tutor:\n${firstReply.content.slice(0, 800)}\n\n` : ""
  }Título:`;
  try {
    let raw = "";
    for await (const ev of provider.stream({
      system: TITLE_SYSTEM,
      context: "",
      messages: [{ role: "user", content: prompt }],
      level: "instant",
      oneOff: true,
    })) {
      if (ev.type === "text") raw += ev.delta;
      if (raw.length > 200) break;
    }
    return cleanTitle(raw) ?? fallbackTitle(userText);
  } catch {
    return fallbackTitle(userText);
  }
}
