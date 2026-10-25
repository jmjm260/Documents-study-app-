// POST /api/focus/review  { course, exam, lessons: [{ topic, task, steps }] }  →  { quiz }
// Prueba de repaso antes de un examen, hecha SOLO con las lecciones guardadas de esa clase.
// Las lecciones viven en el dispositivo y llegan con la petición; aquí no se guarda nada.
import { NextResponse } from "next/server";
import { askOnce } from "@/lib/ai/ask-once";
import { getProvider } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/ai/types";
import { parseReview, REVIEW_SYSTEM, reviewPrompt, validateReviewRequest } from "@/lib/focus";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (supabaseConfigured()) {
    const { data } = await (await createSupabaseServer()).auth.getUser();
    if (!data.user) return NextResponse.json({ error: "Inicia sesión primero." }, { status: 401 });
  }
  const req = validateReviewRequest(await request.json().catch(() => null));
  if (!req) return NextResponse.json({ error: "No hay lecciones de esa clase para repasar." }, { status: 400 });

  try {
    const provider = getProvider();
    const prompt = reviewPrompt(req);
    for (let attempt = 0; attempt < 2; attempt++) {
      const quiz = parseReview(await askOnce(provider, { system: REVIEW_SYSTEM, prompt, level: "medium", signal: request.signal }));
      if (quiz) return NextResponse.json({ quiz });
    }
    return NextResponse.json({ error: "Tocorito no pudo preparar el repaso. Inténtalo otra vez." }, { status: 502 });
  } catch (err) {
    console.error("focus: fallo al generar el repaso:", err instanceof Error ? err.message : "desconocido");
    const error = err instanceof ProviderError ? err.friendly : "Tocorito no pudo preparar el repaso. Inténtalo otra vez.";
    return NextResponse.json({ error }, { status: 500 });
  }
}
