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
export type Course = {
  id: string;
  title: string;
  topic: string;
  level: CourseLevel;
  createdAt: number;
  units: CourseUnit[];
  /** Lo que el estudiante quiere lograr (del chat o del formulario). */
  goal?: string;
  /** Plan de Tocorito: la investigación previa de cómo se aprende esto para lograr el objetivo. */
  plan?: string;
  /** Mientras se crea en segundo plano: "creating"; si falló: "failed"; si el tema no es apto: "refused". */
  status?: "creating" | "failed" | "refused";
  /** Mensaje de Tocorito si lo rechazó, o del error. */
  note?: string;
};

/** Índice que devuelve la IA al crear el curso (todavía sin lecciones generadas). */
export type CourseOutline = { title: string; units: { title: string; lessons: { title: string; goal: string }[] }[] };

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

export type CourseRequest = { topic: string; level: CourseLevel; goal: string; context: string };

export function validateCourseRequest(input: unknown): CourseRequest | null {
  const b = input as Record<string, unknown> | null;
  const topic = clean(b?.topic, 160);
  if (topic.length < 3) return null;
  const level = LEVELS.includes(b?.level as CourseLevel) ? (b!.level as CourseLevel) : "principiante";
  // Del chat: qué quiere lograr y un resumen de lo hablado (nivel, lo que ya sabe, tiempo…).
  return { topic, level, goal: clean(b?.goal, 300), context: clean(b?.context, 1500) };
}

/**
 * Paso 1 (razonamiento alto): antes de diseñar, Tocorito investiga a fondo cómo se aprende esto para
 * lograr el objetivo. Con lo que sabe (no busca en internet). Si el tema no es apto, empieza por "RECHAZO:".
 */
export const COURSE_RESEARCH_SYSTEM = `Eres Tocorito, el tutor de estudio de la app (un tocororo cubano con gafas y café).
Antes de diseñar un curso, INVESTIGAS A FONDO (con todo lo que sabes) cómo debe aprender esto el estudiante para
lograr su objetivo. Piensa como un experto en la materia y en cómo se enseña.

Escribe un plan en texto, en el idioma del estudiante, de 200 a 350 palabras, con estas partes (títulos cortos):
- Objetivo realista: qué podrá hacer al terminar.
- Punto de partida: qué necesita saber antes y qué asumes por lo que dijo.
- Ruta: las etapas en orden, como la enseñan los buenos cursos y currículos de esa materia, y por qué ese orden.
- Práctica: qué debe hacer con sus manos (ejercicios, proyectos) para que se le quede.
- Errores típicos: los que más frenan a quien empieza y cómo evitarlos.
- Tiempo: cuánto le tomará de forma realista con práctica diaria corta.

Público: adolescentes (13+) y adultos. Si el tema no es apropiado para un adolescente (sexo explícito, drogas,
armas, hacer daño, odio, apuestas…) o no se puede aprender, responde SOLO una línea que empiece por
"RECHAZO:" seguida de una frase corta con tu tono pasivo-agresivo, sin sermones.`;

/** Lee el plan (o el rechazo) de la investigación. */
export function parseResearch(raw: string): { plan: string } | { refusal: string } | null {
  const text = raw.trim();
  const refusal = /^\s*RECHAZO:\s*([\s\S]+)/i.exec(text);
  if (refusal) return { refusal: clean(refusal[1], 300) };
  return text.length >= 80 ? { plan: text.slice(0, 4000) } : null;
}

export function outlinePrompt(req: CourseRequest, plan: string): string {
  return `Quiero aprender: ${req.topic}
Nivel: ${req.level}
${req.goal ? `Mi objetivo: ${req.goal}\n` : ""}${req.context ? `Lo que hablamos en el chat: ${req.context}\n` : ""}${
    plan ? `\nTu investigación previa (síguela al diseñar el curso):\n${plan}\n` : ""
  }
Devuelve solo el JSON del índice.`;
}

/**
 * Reglas para Tocorito en el chat: cuándo crear un curso desde la conversación.
 * Escribe un bloque [[CURSO]] que la app convierte en un curso (con investigación previa) en segundo plano.
 */
export const COURSE_CHAT_RULES = `
Cursos desde el chat: si el estudiante dice que quiere aprender algo por su cuenta o lograr una meta de aprendizaje
(que no sea una tarea concreta), puedes OFRECERLE en una frase armarle un curso en Focus. Solo lo creas cuando él
lo pide o acepta tu oferta. Entonces escribe al final de tu respuesta, en una sola línea (no lo ve):
[[CURSO]]{"tema":"Python para hacer videojuegos","nivel":"principiante","objetivo":"Hacer su primer juego 2D","contexto":"Tiene 15 años, sabe usar la compu pero nunca programó; quiere practicar 20 min al día"}[[/CURSO]]
- "tema": qué aprenderá, concreto. "nivel": principiante, intermedio o avanzado (según lo que dijo).
- "objetivo": la meta en una frase. "contexto": resumen de lo hablado que sirva para diseñar el curso
  (lo que ya sabe, cuánto tiempo tiene, para qué lo quiere). Nada de nombres ni datos personales.
- Dile en una frase que vas a investigar cómo aprenderlo y que el curso aparecerá en Focus → Cursos.
- Si el tema no es apropiado para un adolescente, no hay curso: dilo con tu tono, sin bloque.`;

const COURSE_BLOCK = /\[\[CURSO\]\]([\s\S]*?)\[\[\/CURSO\]\]/g;

/** Saca el bloque [[CURSO]] del texto del chat. Vale el primero válido. */
export function extractCourseRequest(text: string): { text: string; course: CourseRequest | null } {
  let course: CourseRequest | null = null;
  for (const [, json] of text.matchAll(COURSE_BLOCK)) {
    if (course) break;
    try {
      const raw = JSON.parse(json.trim()) as Record<string, unknown>;
      course = validateCourseRequest({ topic: raw.tema, level: raw.nivel, goal: raw.objetivo, context: raw.contexto });
    } catch {
      // Bloque mal escrito: se ignora.
    }
  }
  return { text: text.replace(COURSE_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim(), course };
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

/** La lección que va después de `ref` en el curso (pasando a la unidad siguiente), o null si es la última. */
export function nextLesson(course: Course, ref: LessonRef): LessonRef | null {
  const all = flat(course);
  const index = all.findIndex((l) => l.unit === ref.unit && l.lesson === ref.lesson);
  const next = index >= 0 ? all[index + 1] : undefined;
  return next ? { unit: next.unit, lesson: next.lesson } : null;
}

/** Segundos mínimos por diapositiva de explicación la primera vez (para leer y entender; las preguntas no esperan). */
export const COURSE_STEP_SECONDS = 20;

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

export function outlineToCourse(outline: CourseOutline, topic: string, level: CourseLevel, id: string, now: number, extra: { goal?: string; plan?: string } = {}): Course {
  return {
    id,
    title: outline.title,
    topic,
    level,
    createdAt: now,
    ...(extra.goal ? { goal: extra.goal } : {}),
    ...(extra.plan ? { plan: extra.plan } : {}),
    units: outline.units.map((u) => ({ title: u.title, lessons: u.lessons.map((l) => ({ ...l, lesson: null })), test: { quiz: null } })),
  };
}
