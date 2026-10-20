// POST /api/calendar/preview  { url }  →  { tasks, rawSample }
// Descarga el feed, lo convierte en tareas y lo devuelve. No guarda nada.
// La URL va en el cuerpo (no en la query string) y nunca se registra.
import { NextResponse } from "next/server";
import { FeedError, fetchFeed } from "@/lib/feed";
import { parseIcs } from "@/lib/ics";
import { eventsToTasks } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  if (typeof body?.url !== "string") {
    return NextResponse.json({ error: "Falta la URL del feed." }, { status: 400 });
  }

  try {
    const events = parseIcs(await fetchFeed(body.url));
    return NextResponse.json({
      tasks: eventsToTasks(events),
      // Para la fase de validación: qué campos trae realmente cada evento.
      fieldsSeen: [...new Set(events.flatMap((e) => Object.keys(e.raw)))].sort(),
    });
  } catch (err) {
    const message = err instanceof FeedError ? err.message : "Error inesperado al leer el feed.";
    return NextResponse.json({ error: message }, { status: err instanceof FeedError ? 400 : 500 });
  }
}
