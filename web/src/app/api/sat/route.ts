// API del entrenamiento SAT.
//   GET  /api/sat                                  → estado (sin claves de respuesta)
//   POST /api/sat { action: "start", roundId }     → empezar una ronda cronometrada ya preparada
//   POST /api/sat { action: "reveal", roundId, position }            → mostrar la pregunta (empieza su tiempo)
//   POST /api/sat { action: "answer", roundId, position, choice, nonce } → respuesta confirmada (una sola vez)
//   POST /api/sat { action: "ack" }                → visto el reinicio, seguir
//   POST /api/sat { action: "report", itemId, reason, contest }      → reportar / impugnar una pregunta
// La clave correcta nunca viaja al navegador antes de responder. No registramos el contenido de las respuestas.
import { NextResponse } from "next/server";
import { conversationContext } from "@/lib/server/conversation-context";
import { acknowledge, getView, reportItem, revealQuestion, startTimedRound, submitAnswer } from "@/lib/server/sat-service";
import { OPTION_IDS, type OptionId } from "@/lib/sat/items";
import { SatError } from "@/lib/sat/engine";

export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(request: Request) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  try {
    return ctx.json(await getView(ctx.userId));
  } catch (err) {
    console.error("sat: GET falló:", err instanceof Error ? err.message : err);
    return ctx.json({ error: "No pude cargar tu entrenamiento." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const ctx = await conversationContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const roundId = typeof b.roundId === "string" && ID_RE.test(b.roundId) ? b.roundId : "";
  const position = Number.isInteger(b.position) ? (b.position as number) : -1;
  try {
    switch (b.action) {
      case "start":
        return ctx.json(await startTimedRound(ctx.userId, roundId));
      case "reveal":
        return ctx.json(await revealQuestion(ctx.userId, roundId, position));
      case "answer": {
        const choice = String(b.choice ?? "").toUpperCase() as OptionId;
        const nonce = typeof b.nonce === "string" && ID_RE.test(b.nonce) ? b.nonce : "";
        if (!OPTION_IDS.includes(choice) || !nonce) return ctx.json({ error: "Respuesta no válida." }, { status: 400 });
        return ctx.json(await submitAnswer(ctx.userId, { roundId, position, choice, nonce }));
      }
      case "ack":
        return ctx.json(await acknowledge(ctx.userId));
      case "report": {
        const itemId = typeof b.itemId === "string" && ID_RE.test(b.itemId) ? b.itemId : "";
        if (!itemId) return ctx.json({ error: "Falta la pregunta." }, { status: 400 });
        return ctx.json(await reportItem(ctx.userId, { itemId, reason: typeof b.reason === "string" ? b.reason : "", contest: b.contest === true }));
      }
      default:
        return ctx.json({ error: "Acción desconocida." }, { status: 400 });
    }
  } catch (err) {
    // Desincronización (otra pestaña, doble clic, ronda que ya cambió): no es un error académico.
    if (err instanceof SatError) return ctx.json({ error: err.message, code: err.code }, { status: 409 });
    console.error("sat: POST falló:", err instanceof Error ? err.message : err);
    return ctx.json({ error: "Problema técnico: no cuenta como error. Inténtalo otra vez." }, { status: 500 });
  }
}
