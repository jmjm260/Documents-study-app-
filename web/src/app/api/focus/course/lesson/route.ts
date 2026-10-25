// POST /api/focus/course/lesson  { course, level, unit, title, goal, previous }  →  { lesson }
// Genera una lección de un curso (pasos + mini test) la primera vez que el estudiante la abre.
import { NextResponse } from "next/server";
import { askOnce } from "@/lib/ai/ask-once";
import { getProvider } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/ai/types";
import { COURSE_LESSON_SYSTEM, courseLessonPrompt, validateCourseLessonRequest } from "@/lib/courses";
import { parseLesson } from "@/lib/focus";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (supabaseConfigured()) {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  const req = validateCourseLessonRequest(await request.json().catch(() => null));
  if (!req) return NextResponse.json({ error: "Falta la lección." }, { status: 400 });

  try {
    const provider = getProvider();
    const prompt = courseLessonPrompt(req);
    for (let attempt = 0; attempt < 2; attempt++) {
      const lesson = parseLesson(await askOnce(provider, { system: COURSE_LESSON_SYSTEM, prompt, level: "medium", signal: request.signal }));
      if (lesson) return NextResponse.json({ lesson });
    }
    return NextResponse.json({ error: "Tocorito no pudo preparar la lección. Inténtalo otra vez." }, { status: 502 });
  } catch (err) {
    console.error("focus: fallo al generar la lección del curso:", err instanceof Error ? err.message : "desconocido");
    const error = err instanceof ProviderError ? err.friendly : "Tocorito no pudo preparar la lección. Inténtalo otra vez.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
