// POST /api/focus/course  { topic, level }  →  { outline } | { refusal }
// Tocorito diseña el índice de un curso (unidades y lecciones). Las lecciones se generan después, al abrirlas.
// No guarda nada (el curso vive en el dispositivo); no registramos el tema.
import { NextResponse } from "next/server";
import { askOnce } from "@/lib/ai/ask-once";
import { getProvider } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/ai/types";
import { COURSE_OUTLINE_SYSTEM, parseOutline, validateCourseRequest } from "@/lib/courses";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (supabaseConfigured()) {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  const req = validateCourseRequest(await request.json().catch(() => null));
  if (!req) return NextResponse.json({ error: "Dime qué quieres aprender (al menos unas palabras)." }, { status: 400 });

  const prompt = `Quiero aprender: ${req.topic}\nNivel: ${req.level}\n\nDevuelve solo el JSON del índice.`;
  try {
    const provider = getProvider();
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = parseOutline(await askOnce(provider, { system: COURSE_OUTLINE_SYSTEM, prompt, level: "medium", signal: request.signal }));
      if (result && "refusal" in result) return NextResponse.json({ refusal: result.refusal });
      if (result) return NextResponse.json({ outline: result });
    }
    return NextResponse.json({ error: "Tocorito no pudo armar el curso. Inténtalo otra vez." }, { status: 502 });
  } catch (err) {
    console.error("focus: fallo al crear el curso:", err instanceof Error ? err.message : "desconocido");
    const error = err instanceof ProviderError ? err.friendly : "Tocorito no pudo armar el curso. Inténtalo otra vez.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
