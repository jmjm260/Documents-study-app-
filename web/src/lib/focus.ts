// Focus: después de que Tocorito resuelve una tarea, el estudiante hace una mini lección (2–4 min)
// y una prueba rápida sobre esa tarea. Aquí está la parte compartida (servidor y navegador):
// la marca [[FOCUS]] que pone Tocorito, y el formato y la validación de la lección.

/** Lo que Tocorito resolvió: de esto sale la lección. */
export type FocusTopic = { topic: string; task: string };

export type LessonStep = { heading: string; body: string };
export type QuizQuestion = { question: string; options: string[]; answer: number; explanation: string };
export type Lesson = { title: string; steps: LessonStep[]; quiz: QuizQuestion[] };

/** Tiempo mínimo de lectura de la lección completa (se reparte entre los pasos). */
export const MIN_LESSON_SECONDS = 120;
export const MIN_STEP_SECONDS = 20;

export function stepSeconds(lesson: Lesson): number {
  return Math.max(MIN_STEP_SECONDS, Math.ceil(MIN_LESSON_SECONDS / lesson.steps.length));
}

/** Reglas para Tocorito en el chat: cuándo poner la marca. Van en las instrucciones de sistema. */
export const FOCUS_RULES = `
Focus (obligatorio): cada vez que RESUELVAS una tarea o ejercicios por el estudiante (le das las respuestas,
resuelves los ejercicios de una foto, le escribes el trabajo hecho), escribe al final de tu respuesta UN bloque,
en una sola línea (el estudiante no lo ve):
[[FOCUS]]{"tema":"Ecuaciones de primer grado","tarea":"Resolver 3x + 5 = 20 y 2x - 4 = 10"}[[/FOCUS]]
- "tema": el tema en pocas palabras. "tarea": qué resolviste, en una frase (con los datos clave).
- La app lo manda después a Focus: una mini lección contigo de 2–4 minutos y una prueba corta, sin poder saltarla.
  Avísale en una frase corta con tu tono ("Ahora te toca Focus conmigo. No, no te lo puedes saltar. 🙄").
- NO pongas el bloque si solo explicas un concepto, guías paso a paso sin dar la solución, haces un quiz,
  charlas o anotas cosas en el calendario.`;

const FOCUS_BLOCK = /\[\[FOCUS\]\]([\s\S]*?)\[\[\/FOCUS\]\]/g;

const shortText = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Saca la marca [[FOCUS]] del texto. Si hay varias, vale la primera válida. */
export function extractFocus(text: string): { text: string; focus: FocusTopic | null } {
  let focus: FocusTopic | null = null;
  for (const [, json] of text.matchAll(FOCUS_BLOCK)) {
    if (focus) break;
    try {
      const raw = JSON.parse(json.trim()) as Record<string, unknown>;
      const topic = shortText(raw.tema, 80);
      const task = shortText(raw.tarea, 300);
      if (topic && task) focus = { topic, task };
    } catch {
      // Bloque mal escrito: se ignora.
    }
  }
  const clean = text.replace(FOCUS_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: clean, focus };
}

/** Valida lo que pide el navegador para generar la lección. */
export function validateFocusRequest(input: unknown): (FocusTopic & { solution: string }) | null {
  const b = input as Record<string, unknown> | null;
  const topic = shortText(b?.topic, 80);
  const task = shortText(b?.task, 300);
  if (!topic || !task) return null;
  const solution = typeof b?.solution === "string" ? b.solution.trim().slice(0, 4000) : "";
  return { topic, task, solution };
}

export const LESSON_SYSTEM = `Eres Tocorito, el tutor de estudio (un tocororo cubano con gafas y café), un poco pasivo-agresivo
pero buen profe. Acabas de resolverle una tarea al estudiante y ahora le das una MINI LECCIÓN para que entienda
lo que hiciste, más una prueba rápida.

Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin \`\`\`), con esta forma:
{"titulo":"…","pasos":[{"titulo":"…","texto":"…"}],"prueba":[{"pregunta":"…","opciones":["…","…","…","…"],"correcta":0,"explicacion":"…"}]}

Reglas:
- En el idioma del estudiante (normalmente español). Público: adolescentes (13+) y adultos.
- "pasos": entre 3 y 5. Cada "texto" de 50 a 110 palabras: en total se lee en 2–4 minutos.
  Del concepto base a cómo se resolvió SU tarea, paso a paso, y un error típico a evitar.
- Puedes soltar algún pique corto con tu tono, pero lo importante es que aprenda.
- Fórmulas en LaTeX entre $...$; código entre comillas invertidas.
- "prueba": 3 preguntas de opción múltiple (4 opciones) sobre la tarea, con datos parecidos pero NO idénticos,
  para comprobar que entendió y no que memorizó. "correcta" = índice (0–3) de la opción buena.
  "explicacion": 1–2 frases de por qué es esa.
- No inventes datos de la tarea que no tengas: usa solo lo que viene abajo.`;

/** Saca el JSON de la respuesta de la IA (aunque venga con ``` o texto alrededor). */
export function parseLesson(raw: string): Lesson | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return validateLesson(JSON.parse(raw.slice(start, end + 1)));
  } catch {
    return null;
  }
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validateLesson(input: unknown): Lesson | null {
  const r = input as Record<string, unknown> | null;
  if (!r) return null;
  const steps = (Array.isArray(r.pasos) ? r.pasos : [])
    .slice(0, 5)
    .map((s) => ({ heading: text(s?.titulo, 100), body: text(s?.texto, 1200) }))
    .filter((s) => s.heading && s.body);
  const quiz = (Array.isArray(r.prueba) ? r.prueba : []).slice(0, 4).flatMap((q): QuizQuestion[] => {
    const options = (Array.isArray(q?.opciones) ? q.opciones : []).slice(0, 4).map((o: unknown) => text(o, 200)).filter(Boolean);
    const answer = q?.correcta;
    const question = text(q?.pregunta, 400);
    if (!question || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return [];
    return [{ question, options, answer, explanation: text(q?.explicacion, 500) }];
  });
  if (steps.length < 2 || quiz.length < 1) return null;
  return { title: text(r.titulo, 100) || "Mini lección", steps, quiz };
}
