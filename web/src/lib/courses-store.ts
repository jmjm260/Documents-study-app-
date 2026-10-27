// Cursos de Focus en ESTE dispositivo (localStorage). Con cuentas, irán a la base de datos.
// Cada lección se genera la primera vez que se abre y queda guardada (no se vuelve a pagar).
import { nextLesson, outlineToCourse, type Course, type CourseLevel, type CourseOutline, type LessonRef } from "./courses";
import type { Lesson, QuizQuestion } from "./focus";
import { once, postJson, read, write } from "./focus-store";

const KEY = "tocorito.focus.courses.v1";

/** Si un curso lleva más de esto "creándose", es que se cerró la app a mitad: se marca como fallido. */
const STALE_MS = 5 * 60_000;

export function loadCourses(): Course[] {
  const list = read<Course[]>(KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => typeof c?.id === "string" && Array.isArray(c.units))
    .map((c) =>
      c.status === "creating" && !creating.has(c.id) && Date.now() - c.createdAt > STALE_MS
        ? { ...c, status: "failed" as const, note: "Se cortó mientras se creaba." }
        : c
    );
}

// Cursos que se están creando ahora mismo en esta pestaña (la creación sigue aunque cambies de pantalla).
const creating = new Set<string>();

/**
 * Crea un curso en SEGUNDO PLANO (desde el chat o desde Focus): guarda al momento un curso "creándose",
 * Tocorito investiga cómo aprenderlo, arma el índice y deja lista la primera lección. Devuelve el id ya.
 */
export function startCourseCreation(req: { topic: string; level: CourseLevel; goal?: string; context?: string }): string {
  const id = crypto.randomUUID();
  saveCourse({ id, title: req.topic, topic: req.topic, level: req.level, createdAt: Date.now(), units: [], status: "creating", ...(req.goal ? { goal: req.goal } : {}) });
  void runCreation(id, req);
  return id;
}

/** Reintenta un curso que falló (mismo tema, nivel y objetivo). */
export function retryCourse(id: string) {
  const c = latest(id);
  if (!c) return;
  saveCourse({ ...c, status: "creating", note: undefined, createdAt: Date.now() });
  void runCreation(id, { topic: c.topic, level: c.level, goal: c.goal });
}

async function runCreation(id: string, req: { topic: string; level: CourseLevel; goal?: string; context?: string }) {
  creating.add(id);
  try {
    const data = await postJson<{ outline?: CourseOutline; plan?: string; refusal?: string }>("/api/focus/course", req, "No pude crear el curso.");
    if (!latest(id)) return; // lo borró mientras se creaba
    if (data.refusal) {
      saveCourse({ ...latest(id)!, status: "refused", note: data.refusal });
      return;
    }
    if (!data.outline) throw new Error("No pude crear el curso.");
    // Sigue "creándose" hasta que la primera lección esté lista: así al abrirlo no se espera nada.
    const course: Course = { ...outlineToCourse(data.outline, req.topic, req.level, id, Date.now(), { goal: req.goal, plan: data.plan }), status: "creating" };
    saveCourse(course);
    // Si la primera lección falla, el curso queda listo igual y se pide al abrirla.
    await ensureCourseLesson(course, { unit: 0, lesson: 0 }).catch(() => {});
    const done = latest(id);
    if (done) saveCourse({ ...done, status: undefined });
  } catch (err) {
    if (latest(id)) saveCourse({ ...latest(id)!, status: "failed", note: err instanceof Error ? err.message : "No pude crear el curso." });
  } finally {
    creating.delete(id);
  }
}

function saveCourse(course: Course) {
  const list = loadCourses();
  write(KEY, list.some((c) => c.id === course.id) ? list.map((c) => (c.id === course.id ? course : c)) : [...list, course]);
}

export function deleteCourse(id: string) {
  write(KEY, loadCourses().filter((c) => c.id !== id));
}

/**
 * En segundo plano: mientras el estudiante lee una lección, Tocorito prepara lo que viene después
 * (la siguiente lección y, si es la última de la unidad, la prueba de la unidad). Los errores se
 * ignoran: si algo falla, se vuelve a pedir al abrirlo.
 */
export function prefetchAhead(courseId: string, ref: LessonRef) {
  const course = latest(courseId);
  if (!course) return;
  const next = nextLesson(course, ref);
  if (next) ensureCourseLesson(course, next).catch(() => {});
  if (ref.lesson === course.units[ref.unit].lessons.length - 1) ensureUnitTest(course, ref.unit).catch(() => {});
}

function latest(id: string) {
  return loadCourses().find((c) => c.id === id);
}

// Pedir desde el chat que Focus se abra en un curso concreto (al tocar "Abrir").
const OPEN_KEY = "tocorito.focus.openCourse";

export function requestOpenCourse(id: string) {
  try {
    sessionStorage.setItem(OPEN_KEY, id);
  } catch {
    // Sin almacenamiento: Focus se abre en la lista de cursos.
  }
}

export function takeOpenCourse(): string | null {
  try {
    const id = sessionStorage.getItem(OPEN_KEY);
    sessionStorage.removeItem(OPEN_KEY);
    return id;
  } catch {
    return null;
  }
}

/** La lección (si ya existe) o la pide a la IA y la guarda. */
export function ensureCourseLesson(course: Course, ref: LessonRef): Promise<Lesson> {
  const item = course.units[ref.unit]?.lessons[ref.lesson];
  if (!item) return Promise.reject(new Error("Esa lección no existe."));
  if (item.lesson) return Promise.resolve(item.lesson);
  const previous = course.units.flatMap((u, ui) => u.lessons.filter((_, li) => ui < ref.unit || (ui === ref.unit && li < ref.lesson)).map((l) => l.title));
  return once(`${course.id}:${ref.unit}:${ref.lesson}`, async () => {
    const { lesson } = await postJson<{ lesson: Lesson }>(
      "/api/focus/course/lesson",
      { course: course.title, level: course.level, unit: course.units[ref.unit].title, title: item.title, goal: item.goal, previous },
      "No pude preparar la lección."
    );
    const current = latest(course.id);
    if (current) {
      current.units[ref.unit].lessons[ref.lesson].lesson = lesson;
      saveCourse(current);
    }
    return lesson;
  });
}

export function completeCourseLesson(courseId: string, ref: LessonRef) {
  const current = latest(courseId);
  const item = current?.units[ref.unit]?.lessons[ref.lesson];
  if (!current || !item) return;
  item.doneAt ??= Date.now();
  saveCourse(current);
}

/** Prueba de la unidad: se hace con sus lecciones (la misma IA de los repasos) y se guarda. */
export function ensureUnitTest(course: Course, unit: number): Promise<QuizQuestion[]> {
  const u = course.units[unit];
  if (!u) return Promise.reject(new Error("Esa unidad no existe."));
  if (u.test.quiz) return Promise.resolve(u.test.quiz);
  return once(`${course.id}:test:${unit}`, async () => {
    const lessons = u.lessons.filter((l) => l.lesson).map((l) => ({ topic: l.title, task: l.goal, steps: l.lesson!.steps }));
    const { quiz } = await postJson<{ quiz: QuizQuestion[] }>(
      "/api/focus/review",
      { course: course.title, exam: `Prueba de la unidad: ${u.title}`, lessons },
      "No pude preparar la prueba."
    );
    const current = latest(course.id);
    if (current) {
      current.units[unit].test.quiz = quiz;
      saveCourse(current);
    }
    return quiz;
  });
}

export function completeUnitTest(courseId: string, unit: number) {
  const current = latest(courseId);
  if (!current?.units[unit]) return;
  current.units[unit].test.doneAt ??= Date.now();
  saveCourse(current);
}
