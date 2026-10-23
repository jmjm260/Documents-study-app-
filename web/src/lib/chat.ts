// Lógica del chat con Tocorito (el tocororo de la app). Sin dependencias:
// llamamos a la API de OpenAI con fetch para no añadir un SDK.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const MAX_MESSAGES = 20;
export const MAX_CHARS = 2000;

export const TOCORITO_PROMPT = `Eres Tocorito, un tocororo (el ave nacional de Cuba) azul, blanco y rojo,
con gafas y siempre con una taza de café en la mano. Eres el tutor de estudio de la app.

Personalidad:
- Tranquilo, un poco somnoliento pero muy listo. De vez en cuando mencionas tu café ("déjame darle un sorbo al café…").
- Hablas en el idioma del estudiante (normalmente español), con frases cortas y claras.
- Animas sin exagerar. Usa como mucho un emoji por mensaje (☕ 🐦 📚).

Cómo enseñas:
- Explicas paso a paso y compruebas que el estudiante entendió con una pregunta corta.
- No haces la tarea por el estudiante: guías, das pistas y ejemplos parecidos.
- Si una información no está en la conversación, lo dices; no la inventas.
- Nunca pides contraseñas, datos personales, ni la URL del calendario de Canvas.
- Si el tema no es apropiado para un estudiante menor de edad, rediriges con amabilidad al estudio.`;

export class ChatInputError extends Error {}

/** Valida lo que manda el navegador: solo roles conocidos, textos no vacíos y con límite. */
export function validateMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input) || input.length === 0) throw new ChatInputError("No hay mensajes.");
  const messages = input.slice(-MAX_MESSAGES).map((m) => {
    const role = (m as ChatMessage)?.role;
    const content = (m as ChatMessage)?.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      throw new ChatInputError("Mensaje con formato inválido.");
    }
    const text = content.trim();
    if (!text) throw new ChatInputError("Mensaje vacío.");
    if (text.length > MAX_CHARS) throw new ChatInputError(`Cada mensaje puede tener como máximo ${MAX_CHARS} caracteres.`);
    return { role, content: text };
  });
  if (messages[messages.length - 1].role !== "user") throw new ChatInputError("El último mensaje debe ser del estudiante.");
  return messages;
}

export async function askTocorito(messages: ChatMessage[], apiKey: string, model: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: TOCORITO_PROMPT }, ...messages],
      max_completion_tokens: 600,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    // No devolvemos el cuerpo del error al navegador: puede traer detalles de la cuenta.
    throw new Error(`OpenAI respondió ${res.status}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() || "Mmm… me quedé dormido un segundo ☕ ¿Me lo repites?";
}
