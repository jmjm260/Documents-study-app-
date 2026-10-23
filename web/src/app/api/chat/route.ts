// POST /api/chat  { messages }  →  { reply }
// Las claves viven solo en el servidor (variables de entorno), nunca en el navegador.
// No registramos el contenido de los mensajes.
//
// CHAT_PROVIDER elige quién responde:
//   "openai" (por defecto) → API de OpenAI con OPENAI_API_KEY
//   "claude"               → Claude Code local, solo para pruebas en tu computadora
import { NextResponse } from "next/server";
import { askTocorito, ChatInputError, OpenAIError, validateMessages } from "@/lib/chat";
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

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  try {
    const messages = validateMessages(body?.messages);
    const reply =
      provider === "claude"
        ? await askTocoritoLocal(messages)
        : await askTocorito(messages, apiKey!, process.env.OPENAI_MODEL || "gpt-4.1-mini");
    return NextResponse.json({ reply });
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
