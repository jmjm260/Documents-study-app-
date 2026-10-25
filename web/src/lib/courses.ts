// Cursos de Focus: el estudiante le dice a Tocorito qué quiere aprender y Tocorito genera un curso
// (unidades → lecciones, como Duolingo). Aquí está la parte compartida (servidor y navegador):
// formato, validación, instrucciones para la IA y qué está desbloqueado.
//
// Para no gastar IA de más, al crear el curso solo se genera el ÍNDICE (títulos y objetivos).
// Cada lección (pasos + mini test) se genera la primera vez que se abre, y se guarda.
import type { Lesson, QuizQuestion } from "./focus";

export const LEVELS = ["principiante", "intermedio", "avanzado"] as const;
export type CourseLevel = (typeof LEVELS)[number];

export type CourseLesson = { title: string; goal: string; lesson: Lesson | null; doneAt?: number };
export type CourseUnit = { title: string; lessons: CourseLesson[]; test: { quiz: QuizQuestion[] | null; doneAt?: number } };
export type Course = { id: string; title: string; topic: string; level: CourseLevel; createdAt: number; units: CourseUnit[] };

/** Índice que devuelve la IA al crear el curso (todavía sin lecciones generadas). */
export type CourseOutline = { title: string; units: { title: string; lessons: { title: string; goal: string }[] }[] };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function validateCourseRequest(input: unknown): { topic: string; level: CourseLevel } | null {
  const b = input as Record<string, unknown> | null;
  const topic = clean(b?.topic, 160);
  if (topic.length < 3) return null;
  const level = LEVELS.includes(b?.level as CourseLevel) ? (b!.level as CourseLevel) : "principiante";
  return { topic, level };
}

export const COURSE_OUTLINE_SYSTEM = `Eres Tocorito, el tutor de estudio de la app (un tocororo cubano con gafas y café).
El estudiante quiere aprender algo por su cuenta. Diseñas el ÍNDICE de un curso corto, como en Duolingo:
unidades con lecciones pequeñas que van de lo más básico a lo más avanzado.

Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin \`\`\`):
{"titulo":"…","unidades":[{"titulo":"…","lecciones":[{"titulo":"…","objetivo":"…"}]}]}

Reglas:
- Entre 3 y 5 unidades; cada una con 3 o 4 lecciones. Cada lección se aprende en 3–5 minutos.
- "titulo" del curso: corto (máx. 6 palabras). Títulos de unidades y lecciones: cortos y claros.
- "objetivo": una frase con lo que sabrá hacer al terminar esa lección.
- Ajusta la dificultad al nivel que pide. En el idioma del estudiante (normalmente español).
- El público son adolescentes (13+) y adultos. Si el tema no es apropiado para un adolescente (sexo explícito,
  drogas, armas, hacer daño, odio, apuestas…) o no es algo que se pueda aprender, NO hagas el curso: responde
  {"rechazo":"…"} con una frase corta con tu tono pasivo-agresivo, sin sermones.`;

export const COURSE_LESSON_SYSTEM = `Eres Tocorito, el tutor de estudio (un tocororo cubano con gafas y café), un poco pasivo-agresivo
pero buen profe. Das UNA lección de un curso que el estudiante eligió aprender por su cuenta, más una prueba rápida.

Responde SOLO con un objeto JSON válido (sin texto antes ni después, sin \`\`\`), con esta forma:
{"titulo":"…","pasos":[{"titulo":"…","texto":"…"}],"prueba":[{"pregunta":"…","opciones":["…","…","…","…"],"correcta":0,"explicacion":"…"}]}

Reglas:
- Enseña SOLO el objetivo de esta lección, suponiendo que ya sabe lo de las lecciones anteriores (vienen abajo).
- "pasos": entre 3 y 5. Cada "texto" de 40 a 100 palabras, con un ejemplo concreto. Del concepto a cómo se usa.
- Puedes soltar algún pique corto con tu tono, pero lo importante es que aprenda.
- Fórmulas en LaTeX entre $...$; código entre comillas invertidas o en bloque \`\`\`.
- "prueba": 3 preguntas de opción múltiple (4 opciones) sobre lo de esta lección. "correcta" = índice (0–3).
  "explicacion": 1–2 frases.
- En el idioma del curso. Público: adolescentes (13+) y adultos.`;

/** Lee el índice del curso (o el rechazo) de la respuesta de la IA. */
export function parseOutline(raw: string): CourseOutline | { refusal: string } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const refusal = clean(data.rechazo, 300);
  if (refusal) return { refusal };
  const units = (Array.isArray(data.unidades) ? data.unidades : []).slice(0, 6).flatMap((u) => {
    const title = clean(u?.titulo, 80);
    const lessons = (Array.isArray(u?.lecciones) ? u.lecciones : [])
      .slice(0, 5)
      .map((l: Record<string, unknown>) => ({ title: clean(l?.titulo, 80), goal: clean(l?.objetivo, 240) }))
      .filter((l: { title: string }) => l.title);
    return title && lessons.length >= 2 ? [{ title, lessons }] : [];
  });
  const title = clean(data.titulo, 80);
  return title && units.length >= 2 ? { title, units } : null;
}

export function validateCourseLessonRequest(input: unknown) {
  const b = input as Record<string, unknown> | null;
  const course = clean(b?.course, 80);
  const unit = clean(b?.unit, 80);
  const title = clean(b?.title, 80);
  if (!course || !unit || !title) return null;
  const previous = (Array.isArray(b?.previous) ? b.previous : []).slice(-20).map((p) => clean(p, 80)).filter(Boolean);
  const level = LEVELS.includes(b?.level as CourseLevel) ? (b!.level as CourseLevel) : "principiante";
  return { course, unit, title, goal: clean(b?.goal, 240), level, previous };
}

export function courseLessonPrompt(req: NonNullable<ReturnType<typeof validateCourseLessonRequest>>): string {
  return `Curso: ${req.course} (nivel ${req.level})
Unidad: ${req.unit}
Lección: ${req.title}
Objetivo: ${req.goal || "(el del título)"}
${req.previous.length ? `Ya vio: ${req.previous.join("; ")}` : "Es la primera lección del curso."}

Devuelve solo el JSON de la lección.`;
}

// --- Progreso (desbloqueo en orden, como Duolingo) ---

export type LessonRef = { unit: number; lesson: number };

/** Todas las lecciones en orden. */
function flat(course: Course): (LessonRef & { done: boolean })[] {
  return course.units.flatMap((u, ui) => u.lessons.map((l, li) => ({ unit: ui, lesson: li, done: Boolean(l.doneAt) })));
}

/** La lección que toca (la primera sin hacer), o null si ya terminó todas. */
export function currentLesson(course: Course): LessonRef | null {
  const next = flat(course).find((l) => !l.done);
  return next ? { unit: next.unit, lesson: next.lesson } : null;
}

/** Una lección se abre si todas las anteriores están hechas. Las hechas se pueden repetir siempre. */
export function isUnlocked(course: Course, ref: LessonRef): boolean {
  const all = flat(course);
  const index = all.findIndex((l) => l.unit === ref.unit && l.lesson === ref.lesson);
  return index >= 0 && all.slice(0, index).every((l) => l.done);
}

/** El trofeo de la unidad se abre cuando están hechas todas sus lecciones. */
export const isUnitTestUnlocked = (course: Course, unit: number) => course.units[unit]?.lessons.every((l) => l.doneAt) ?? false;

export function courseProgress(course: Course): { done: number; total: number } {
  const all = flat(course);
  return { done: all.filter((l) => l.done).length, total: all.length };
}

export function outlineToCourse(outline: CourseOutline, topic: string, level: CourseLevel, id: string, now: number): Course {
  return {
    id,
    title: outline.title,
    topic,
    level,
    createdAt: now,
    units: outline.units.map((u) => ({ title: u.title, lessons: u.lessons.map((l) => ({ ...l, lesson: null })), test: { quiz: null } })),
  };
}
