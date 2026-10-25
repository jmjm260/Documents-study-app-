// Focus: después de que Tocorito resuelve una tarea, el estudiante hace una mini lección (2–4 min)
// y una prueba rápida sobre esa tarea. Aquí está la parte compartida (servidor y navegador):
// la marca [[FOCUS]] que pone Tocorito, y el formato y la validación de la lección.

/** Lo que Tocorito resolvió: de esto sale la lección. `course` = la clase (la deduce Tocorito). */
export type FocusTopic = { course: string; topic: string; task: string };

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
[[FOCUS]]{"clase":"Álgebra","tema":"Ecuaciones de primer grado","tarea":"Resolver 3x + 5 = 20 y 2x - 4 = 10"}[[/FOCUS]]
- "clase": la asignatura a la que pertenece, DEDÚCELA tú sin preguntar (por el contenido, la conversación o
  los cursos del calendario). Si ya hay lecciones guardadas o un curso del calendario de esa misma clase,
  usa EXACTAMENTE ese nombre, para que todo lo de una clase quede junto.
- "tema": el tema en pocas palabras. "tarea": qué resolviste, en una frase (con los datos clave).
- La app lo manda después a Focus: una mini lección contigo de 2–4 minutos y una prueba corta, sin poder saltarla.
  Avísale en una frase corta con tu tono ("Ahora te toca Focus conmigo. No, no te lo puedes saltar. 🙄").
- NO pongas el bloque si solo explicas un concepto, guías paso a paso sin dar la solución, haces un quiz,
  charlas o anotas cosas en el calendario.

Prueba de repaso: con cada mensaje puedes recibir "Lecciones guardadas en Focus" (clase y tema de cada una).
Cuando el estudiante te pida anotar un EXAMEN, una prueba o un quiz, mira de qué clase es. Si hay lecciones
guardadas de ESA MISMA clase, además del bloque de calendario escribe, en una sola línea:
[[REPASO]]{"clase":"Álgebra"}[[/REPASO]]
- "clase": el nombre EXACTO de la clase tal como sale en la lista de lecciones.
- Solo si la clase del examen y la de las lecciones es la misma asignatura. Si no hay lecciones de esa
  clase, o no está claro de qué clase es el examen, no pongas el bloque.
- Dile en una frase que le dejaste en Focus una prueba de repaso con sus lecciones de esa clase.`;

/** Nombre de clase para comparar: sin tildes, mayúsculas ni espacios de más ("Física I" = "fisica i"). */
export function courseKey(course: string): string {
  return course.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export const sameCourse = (a: string, b: string) => courseKey(a) === courseKey(b);

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
      const course = shortText(raw.clase, 60) || "General";
      if (topic && task) focus = { course, topic, task };
    } catch {
      // Bloque mal escrito: se ignora.
    }
  }
  const clean = text.replace(FOCUS_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: clean, focus };
}

const REVIEW_BLOCK = /\[\[REPASO\]\]([\s\S]*?)\[\[\/REPASO\]\]/g;

/** Saca la marca [[REPASO]]: la clase de la que hay que hacer la prueba de repaso. */
export function extractReview(text: string): { text: string; review: string | null } {
  let review: string | null = null;
  for (const [, json] of text.matchAll(REVIEW_BLOCK)) {
    try {
      review ??= shortText((JSON.parse(json.trim()) as Record<string, unknown>).clase, 60) || null;
    } catch {
      // Bloque mal escrito: se ignora.
    }
  }
  return { text: text.replace(REVIEW_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim(), review };
}

/** Índice de lecciones guardadas que el navegador manda con cada mensaje (solo clase y tema). */
export type LessonIndexItem = { course: string; topic: string };
export const MAX_INDEX = 40;

export function validateLessonIndex(input: unknown): LessonIndexItem[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-MAX_INDEX).flatMap((i) => {
    const course = shortText((i as LessonIndexItem)?.course, 60);
    const topic = shortText((i as LessonIndexItem)?.topic, 80);
    return course && topic ? [{ course, topic }] : [];
  });
}

/** Texto para Tocorito: las lecciones guardadas, agrupadas por clase. */
export function lessonIndexText(items: LessonIndexItem[]): string {
  if (!items.length) return "Lecciones guardadas en Focus: (ninguna)";
  const byCourse = new Map<string, string[]>();
  for (const i of items) byCourse.set(i.course, [...(byCourse.get(i.course) ?? []), i.topic]);
  return `Lecciones guardadas en Focus:\n${[...byCourse].map(([c, topics]) => `- ${c}: ${topics.join("; ")}`).join("\n")}`;
}

/** Valida lo que pide el navegador para generar la lección. */
export function validateFocusRequest(input: unknown): (FocusTopic & { solution: string }) | null {
  const b = input as Record<string, unknown> | null;
  const topic = shortText(b?.topic, 80);
  const task = shortText(b?.task, 300);
  if (!topic || !task) return null;
  const course = shortText(b?.course, 60) || "General";
  const solution = typeof b?.solution === "string" ? b.solution.trim().slice(0, 4000) : "";
  return { course, topic, task, solution };
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
  return validateLesson(jsonFrom(raw));
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Preguntas válidas de un "prueba":[…] (las mal formadas se descartan). */
function validateQuiz(input: unknown, max: number): QuizQuestion[] {
  return (Array.isArray(input) ? input : []).slice(0, max).flatMap((q): QuizQuestion[] => {
    const options = (Array.isArray(q?.opciones) ? q.opciones : []).slice(0, 4).map((o: unknown) => text(o, 200)).filter(Boolean);
    const answer = q?.correcta;
    const question = text(q?.pregunta, 400);
    if (!question || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return [];
    return [{ question, options, answer, explanation: text(q?.explicacion, 500) }];
  });
}

/** Saca el primer objeto JSON de la respuesta de la IA. */
function jsonFrom(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function validateLesson(input: unknown): Lesson | null {
  const r = input as Record<string, unknown> | null;
  if (!r) return null;
  const steps = (Array.isArray(r.pasos) ? r.pasos : [])
    .slice(0, 5)
    .map((s) => ({ heading: text(s?.titulo, 100), body: text(s?.texto, 1200) }))
    .filter((s) => s.heading && s.body);
  const quiz = validateQuiz(r.prueba, 4);
  if (steps.length < 2 || quiz.length < 1) return null;
  return { title: text(r.titulo, 100) || "Mini lección", steps, quiz };
}

// --- Prueba de repaso (antes de un examen, con las lecciones guardadas de esa clase) ---

export const MAX_REVIEW_LESSONS = 12;

export type ReviewLesson = { topic: string; task: string; steps: LessonStep[] };

export function validateReviewRequest(input: unknown): { course: string; exam: string; lessons: ReviewLesson[] } | null {
  const b = input as Record<string, unknown> | null;
  const course = shortText(b?.course, 60);
  const lessons = (Array.isArray(b?.lessons) ? b.lessons : []).slice(-MAX_REVIEW_LESSONS).flatMap((l): ReviewLesson[] => {
    const topic = shortText(l?.topic, 80);
    const task = shortText(l?.task, 300);
    const steps = (Array.isArray(l?.steps) ? l.steps : [])
      .slice(0, 5)
      .map((s: { heading?: unknown; body?: unknown }) => ({ heading: text(s?.heading, 100), body: text(s?.body, 1200) }))
      .filter((s: LessonStep) => s.heading && s.body);
    return topic && steps.length ? [{ topic, task, steps }] : [];
  });
  if (!course || !lessons.length) return null;
  return { course, exam: shortText(b?.exam, 160), lessons };
}

export const REVIEW_SYSTEM = `Eres Tocorito, el tutor de estudio (un tocororo cubano con gafas y café), algo pasivo-agresivo pero buen profe.
El estudiante tiene un examen. Le haces una PRUEBA DE REPASO usando SOLO las lecciones que ya hizo contigo en Focus
(vienen abajo). Nada de temas que no estén en esas lecciones.

Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin \`\`\`):
{"prueba":[{"pregunta":"…","opciones":["…","…","…","…"],"correcta":0,"explicacion":"…"}]}

Reglas:
- Entre 5 y 8 preguntas de opción múltiple (4 opciones), repartidas entre TODAS las lecciones.
- Tipo examen: datos nuevos (no copies los ejercicios de las lecciones), alguna que mezcle temas, y algún error típico.
- "correcta" = índice (0–3) de la opción buena. "explicacion": 1–2 frases (puedes soltar un pique corto).
- En el idioma de las lecciones. Fórmulas en LaTeX entre $...$; código entre comillas invertidas.`;

/** Texto con las lecciones para la IA (recortado para no gastar de más). */
export function reviewPrompt(req: { course: string; exam: string; lessons: ReviewLesson[] }): string {
  const lessons = req.lessons
    .map((l, i) => `Lección ${i + 1}: ${l.topic}\nTarea: ${l.task}\n${l.steps.map((s) => `- ${s.heading}: ${s.body}`).join("\n")}`)
    .join("\n\n")
    .slice(0, 14000);
  return `Clase: ${req.course}\n${req.exam ? `Examen: ${req.exam}\n` : ""}\n${lessons}\n\nDevuelve solo el JSON de la prueba.`;
}

export function parseReview(raw: string): QuizQuestion[] | null {
  const quiz = validateQuiz(jsonFrom(raw)?.prueba, 8);
  return quiz.length >= 3 ? quiz : null;
}
