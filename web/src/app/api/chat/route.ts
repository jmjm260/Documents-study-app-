// POST /api/chat  { messages, context?, reasoningLevel? }
// Responde en streaming (NDJSON: un objeto JSON por línea):
//   {"type":"status","status":"preparing"|"thinking"|"generating"}
//   {"type":"text","delta":"..."}                      ← texto en bruto, según llega
//   {"type":"done","replies":[...],"actions":[...],"removals":["id"],"level":"medium","sip":true}  ← versión final limpia
//                                                     (sip = Tocorito toma café: el navegador lo anima)
//   {"type":"error","error":"..."}
// El navegador solo manda el NIVEL (instant/medium/high); el servidor decide modelo y parámetros.
// No registramos el contenido de los mensajes ni del calendario.
import { NextResponse } from "next/server";
import { prewarmAll } from "@/lib/ai/claude-local";
import { getProvider, providerId } from "@/lib/ai/providers";
import { resolveLevel } from "@/lib/ai/reasoning";
import { ProviderError } from "@/lib/ai/types";
import { recordUsage } from "@/lib/ai/usage";
import { TOCORITO_SYSTEM as SYSTEM } from "@/lib/ai/system";
import { ChatInputError, splitReply, validateMessages } from "@/lib/chat";
import { calendarData, extractActions, validateContext } from "@/lib/chat-actions";
import { extractCoffee } from "@/lib/coffee";

export const runtime = "nodejs";

// Con Claude local, dejamos los procesos listos en cuanto se carga la API.
if (providerId() === "claude-local" && process.env.NODE_ENV !== "production") prewarmAll(SYSTEM);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { messages?: unknown; context?: unknown; reasoningLevel?: unknown } | null;

  let messages;
  let provider;
  try {
    messages = validateMessages(body?.messages);
    provider = getProvider();
  } catch (err) {
    if (err instanceof ChatInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof ProviderError) return NextResponse.json({ error: err.friendly }, { status: 500 });
    throw err;
  }
  const context = validateContext(body?.context);
  // Aquí se aplicará el plan del usuario cuando haya cuentas (allowedLevels por plan).
  const level = resolveLevel(body?.reasoningLevel);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const started = Date.now();
      let firstTokenMs: number | null = null;
      let raw = "";
      let usage = { inputTokens: null as number | null, outputTokens: null as number | null };
      try {
        send({ type: "status", status: "preparing" });
        for await (const ev of provider.stream({
          system: SYSTEM,
          context: context ? calendarData(context) : "",
          messages,
          level,
          signal: request.signal,
        })) {
          if (ev.type === "text") {
            firstTokenMs ??= Date.now() - started;
            raw += ev.delta;
            send(ev);
          } else if (ev.type === "status") {
            send(ev);
          } else if (ev.type === "usage") {
            usage = { inputTokens: ev.inputTokens, outputTokens: ev.outputTokens };
          }
        }
        // Sin contexto no hay acceso al calendario: ignoramos cualquier bloque.
        const { text: withoutActions, actions, removals } = extractActions(raw);
        // Los sorbos de café no van en el texto: el navegador anima a Tocorito.
        const { text, sip } = extractCoffee(withoutActions);
        const replies = text ? splitReply(text) : ["Listo, anotado."];
        send({ type: "done", replies, actions: context ? actions : [], removals: context ? removals : [], level, sip });
        recordUsage({ provider: provider.id, level, ...usage, firstTokenMs, totalMs: Date.now() - started });
      } catch (err) {
        console.error(`chat (${provider.id}, ${level}): fallo:`, err instanceof Error ? err.message : "desconocido");
        send({ type: "error", error: err instanceof ProviderError ? err.friendly : "Tocorito no pudo responder ahora. Inténtalo de nuevo." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
