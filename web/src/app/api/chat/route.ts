// POST /api/chat  { messages }  →  { reply }
// La clave de OpenAI vive solo en el servidor (variable de entorno), nunca en el navegador.
// No registramos el contenido de los mensajes.
import { NextResponse } from "next/server";
import { askTocorito, ChatInputError, OpenAIError, validateMessages } from "@/lib/chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta OPENAI_API_KEY en web/.env.local. Tocorito no puede responder sin ella." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as { messages?: unknown } | null;
  try {
    const messages = validateMessages(body?.messages);
    const reply = await askTocorito(messages, apiKey, process.env.OPENAI_MODEL || "gpt-4.1-mini");
    return NextResponse.json({ reply });
  } catch (err) {
    if (err instanceof ChatInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("chat: fallo al llamar a OpenAI:", err instanceof Error ? err.message : "desconocido");
    const message = err instanceof OpenAIError ? err.friendly : "Tocorito no pudo responder ahora. Inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
