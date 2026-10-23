// POST /api/chat  { messages, context? }  →  { replies: string[], actions: EntryDraft[] }
// - replies: Tocorito puede mandar varios mensajes cortos.
// - actions: lo que Tocorito quiere anotar en el calendario (ya validado); el navegador lo guarda.
// Las claves viven solo en el servidor (variables de entorno), nunca en el navegador.
// No registramos el contenido de los mensajes ni del calendario.
//
// CHAT_PROVIDER elige quién responde:
//   "openai" (por defecto) → API de OpenAI con OPENAI_API_KEY
//   "claude"               → Claude Code local, solo para pruebas en tu computadora
import { NextResponse } from "next/server";
import { askTocorito, ChatInputError, OpenAIError, splitReply, TOCORITO_PROMPT, validateMessages } from "@/lib/chat";
import { calendarPrompt, extractActions, validateContext } from "@/lib/chat-actions";
import { askTocoritoLocal, ClaudeLocalError } from "@/lib/claude-local";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const provider = process.env.CHAT_PROVIDER === "claude" ? "claude" : "openai";
  const apiKey = process.env.OPENAI_API_KEY;
  if (provider === "openai" && !apiKey) {
    return NextResponse.json(
      { error: "Falta OPENAI_API_KEY en web/.env.local. Tocorito no puede responder sin ella." },
      { status: 500 }
    );
  }
  if (provider === "claude" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Claude local solo está disponible en desarrollo." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { messages?: unknown; context?: unknown } | null;
  try {
    const messages = validateMessages(body?.messages);
    const context = validateContext(body?.context);
    const system = context ? `${TOCORITO_PROMPT}\n${calendarPrompt(context)}` : TOCORITO_PROMPT;

    const raw =
      provider === "claude"
        ? await askTocoritoLocal(messages, system)
        : await askTocorito(messages, apiKey!, process.env.OPENAI_MODEL || "gpt-4.1-mini", system);

    // Sin contexto no hay acceso al calendario: ignoramos cualquier bloque.
    const { text, actions } = extractActions(raw);
    const replies = text ? splitReply(text) : ["Listo, anotado ☕"];
    return NextResponse.json({ replies, actions: context ? actions : [] });
  } catch (err) {
    if (err instanceof ChatInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(`chat (${provider}): fallo:`, err instanceof Error ? err.message : "desconocido");
    const message =
      err instanceof OpenAIError || err instanceof ClaudeLocalError
        ? err.friendly
        : "Tocorito no pudo responder ahora. Inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
