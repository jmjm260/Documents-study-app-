// POST /api/focus/lesson  { course, topic, task, solution }  →  { lesson }
// Genera la mini lección (pasos + prueba) sobre la tarea que Tocorito acaba de resolver.
// No guarda nada; no registramos el contenido.
import { NextResponse } from "next/server";
import { askOnce } from "@/lib/ai/ask-once";
import { getProvider } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/ai/types";
import { LESSON_SYSTEM, parseLesson, validateFocusRequest } from "@/lib/focus";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (supabaseConfigured()) {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  const req = validateFocusRequest(await request.json().catch(() => null));
  if (!req) return NextResponse.json({ error: "Falta el tema de la lección." }, { status: 400 });

  const prompt = `Clase: ${req.course}\nTema: ${req.topic}\nTarea que resolviste: ${req.task}\n${
    req.solution ? `\nTu solución (lo que le escribiste en el chat):\n${req.solution}\n` : ""
  }\nDevuelve solo el JSON de la lección.`;

  try {
    const provider = getProvider();
    // Dos intentos: si la IA devuelve un JSON roto, se pide otra vez.
    for (let attempt = 0; attempt < 2; attempt++) {
      const lesson = parseLesson(await askOnce(provider, { system: LESSON_SYSTEM, prompt, level: "medium", signal: request.signal }));
      if (lesson) return NextResponse.json({ lesson });
    }
    return NextResponse.json({ error: "Tocorito no pudo preparar la lección. Inténtalo otra vez." }, { status: 502 });
  } catch (err) {
    console.error("focus: fallo al generar la lección:", err instanceof Error ? err.message : "desconocido");
    const error = err instanceof ProviderError ? err.friendly : "Tocorito no pudo preparar la lección. Inténtalo otra vez.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
