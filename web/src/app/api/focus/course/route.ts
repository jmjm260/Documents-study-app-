// POST /api/focus/course  { topic, level, goal?, context? }  →  { outline, plan } | { refusal }
// Dos pasos:
//   1) Investigación (razonamiento alto): cómo se aprende esto para lograr el objetivo → "Plan de Tocorito".
//   2) Índice del curso (unidades y lecciones) siguiendo ese plan. Las lecciones se generan después.
// No guarda nada (el curso vive en el dispositivo); no registramos el tema ni el contexto.
import { NextResponse } from "next/server";
import { askOnce } from "@/lib/ai/ask-once";
import { getProvider } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/ai/types";
import { COURSE_OUTLINE_SYSTEM, COURSE_RESEARCH_SYSTEM, outlinePrompt, parseOutline, parseResearch, validateCourseRequest } from "@/lib/courses";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (supabaseConfigured()) {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  const req = validateCourseRequest(await request.json().catch(() => null));
  if (!req) return NextResponse.json({ error: "Dime qué quieres aprender (al menos unas palabras)." }, { status: 400 });

  try {
    const provider = getProvider();

    // 1) Investigación. Si falla, el curso se hace igual (sin plan): mejor un curso que ninguno.
    const researchPrompt = `Quiero aprender: ${req.topic}\nNivel: ${req.level}\n${req.goal ? `Mi objetivo: ${req.goal}\n` : ""}${
      req.context ? `Lo que hablamos: ${req.context}\n` : ""
    }`;
    let plan = "";
    const research = parseResearch(await askOnce(provider, { system: COURSE_RESEARCH_SYSTEM, prompt: researchPrompt, level: "high", signal: request.signal }));
    if (research && "refusal" in research) return NextResponse.json({ refusal: research.refusal });
    if (research) plan = research.plan;

    // 2) Índice siguiendo el plan.
    const prompt = outlinePrompt(req, plan);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = parseOutline(await askOnce(provider, { system: COURSE_OUTLINE_SYSTEM, prompt, level: "medium", signal: request.signal }));
      if (result && "refusal" in result) return NextResponse.json({ refusal: result.refusal });
      if (result) return NextResponse.json({ outline: result, plan });
    }
    return NextResponse.json({ error: "Tocorito no pudo armar el curso. Inténtalo otra vez." }, { status: 502 });
  } catch (err) {
    console.error("focus: fallo al crear el curso:", err instanceof Error ? err.message : "desconocido");
    const error = err instanceof ProviderError ? err.friendly : "Tocorito no pudo armar el curso. Inténtalo otra vez.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
