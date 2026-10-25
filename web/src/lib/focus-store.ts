// Focus en ESTE dispositivo (localStorage):
// - el Focus pendiente (mientras haya uno, el chat queda bloqueado),
// - la biblioteca de lecciones terminadas (agrupadas por clase),
// - las pruebas de repaso pendientes (antes de un examen).
// Con cuentas, irá al servidor (en la web, borrar los datos del navegador lo saltaría).
import { sameCourse, type FocusTopic, type Lesson, type LessonIndexItem, type QuizQuestion } from "./focus";

const KEY = "tocorito.focus.v1";
const LIBRARY_KEY = "tocorito.focus.library.v1";
const REVIEWS_KEY = "tocorito.focus.reviews.v1";
export const FOCUS_EVENT = "tocorito-focus";

export type FocusState = FocusTopic & {
  id: string;
  /** Lo que Tocorito escribió al resolverla (para que la lección hable de SU tarea). */
  solution: string;
  createdAt: number;
  lesson: Lesson | null;
  /** Paso de la lección que está leyendo. */
  step: number;
  phase: "lesson" | "quiz";
  /** Preguntas de la prueba ya acertadas (índices). */
  passed: number[];
};

/** Lección terminada: se puede releer y sirve para las pruebas de repaso. */
export type SavedLesson = FocusTopic & { id: string; solution: string; lesson: Lesson; completedAt: number };

export type Review = {
  id: string;
  course: string;
  /** Para qué examen es (texto corto: "Examen de Álgebra, 2026-10-30"). */
  exam: string;
  createdAt: number;
  quiz: QuizQuestion[] | null;
  passed: number[];
  /** Cuándo la terminó. Hecha = se queda guardada y se puede repetir. */
  doneAt?: number;
};

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: dura mientras la pantalla esté abierta.
  }
  window.dispatchEvent(new Event(FOCUS_EVENT));
}

export function loadFocus(): FocusState | null {
  const data = read<FocusState | null>(KEY, null);
  return data && typeof data.id === "string" && typeof data.topic === "string" ? { ...data, course: data.course || "General" } : null;
}

export function saveFocus(state: FocusState | null) {
  write(KEY, state);
}

/** Tocorito resolvió una tarea: queda un Focus pendiente (si ya había uno, se mantiene el primero). */
export function startFocus(topic: FocusTopic, solution: string): FocusState {
  const current = loadFocus();
  if (current) return current;
  const state: FocusState = {
    ...topic,
    id: crypto.randomUUID(),
    solution: solution.slice(0, 4000),
    createdAt: Date.now(),
    lesson: null,
    step: 0,
    phase: "lesson",
    passed: [],
  };
  saveFocus(state);
  prefetchLesson(state);
  return state;
}

/** Focus terminado: la lección pasa a la biblioteca y el chat se desbloquea. */
export function completeFocus(state: FocusState): SavedLesson | null {
  saveFocus(null);
  if (!state.lesson) return null;
  const saved: SavedLesson = {
    id: state.id,
    course: state.course,
    topic: state.topic,
    task: state.task,
    solution: state.solution,
    lesson: state.lesson,
    completedAt: Date.now(),
  };
  write(LIBRARY_KEY, [...loadLibrary().filter((l) => l.id !== saved.id), saved]);
  return saved;
}

export function loadLibrary(): SavedLesson[] {
  const list = read<SavedLesson[]>(LIBRARY_KEY, []);
  return Array.isArray(list) ? list.filter((l) => l?.lesson && typeof l.course === "string") : [];
}

export function deleteLesson(id: string) {
  write(LIBRARY_KEY, loadLibrary().filter((l) => l.id !== id));
}

/** Lo que se manda a Tocorito con cada mensaje: solo clase y tema (no el contenido). */
export function lessonIndex(): LessonIndexItem[] {
  return loadLibrary().map((l) => ({ course: l.course, topic: l.topic }));
}

export function loadReviews(): Review[] {
  const list = read<Review[]>(REVIEWS_KEY, []);
  return Array.isArray(list) ? list.filter((r) => typeof r?.id === "string") : [];
}

function saveReviews(list: Review[]) {
  write(REVIEWS_KEY, list);
}

export function updateReview(review: Review) {
  saveReviews(loadReviews().map((r) => (r.id === review.id ? review : r)));
}

/** Repaso terminado: se queda guardado (para repetirlo) y deja de contar como pendiente. */
export function finishReview(id: string) {
  saveReviews(loadReviews().map((r) => (r.id === id ? { ...r, passed: [], doneAt: Date.now() } : r)));
}

export const isPendingReview = (r: Review) => !r.doneAt;

/**
 * Tocorito anotó un examen de una clase con lecciones: se crea la prueba de repaso (una por clase;
 * si ya había una sin hacer, se renueva) y se empieza a preparar ya.
 */
export function startReview(course: string, exam: string): Review | null {
  const lessons = loadLibrary().filter((l) => sameCourse(l.course, course));
  if (!lessons.length) return null;
  const review: Review = { id: crypto.randomUUID(), course: lessons[lessons.length - 1].course, exam, createdAt: Date.now(), quiz: null, passed: [] };
  saveReviews([...loadReviews().filter((r) => !sameCourse(r.course, course)), review]);
  prefetchReview(review);
  return review;
}

// Una sola petición por lección o repaso, aunque la pidan el chat (por adelantado) y Focus a la vez.
const inflight = new Map<string, Promise<unknown>>();

function once<T>(id: string, make: () => Promise<T>): Promise<T> {
  let p = inflight.get(id) as Promise<T> | undefined;
  if (!p) {
    p = make().finally(() => inflight.delete(id));
    inflight.set(id, p);
  }
  return p;
}

async function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data as T;
}

export function prefetchLesson(state: FocusState): Promise<Lesson> {
  if (state.lesson) return Promise.resolve(state.lesson);
  return once(state.id, async () => {
    const { lesson } = await postJson<{ lesson: Lesson }>(
      "/api/focus/lesson",
      { course: state.course, topic: state.topic, task: state.task, solution: state.solution },
      "No pude preparar la lección."
    );
    const latest = loadFocus();
    if (latest?.id === state.id) saveFocus({ ...latest, lesson });
    return lesson;
  });
}

export function prefetchReview(review: Review): Promise<QuizQuestion[]> {
  if (review.quiz) return Promise.resolve(review.quiz);
  return once(review.id, async () => {
    const lessons = loadLibrary()
      .filter((l) => sameCourse(l.course, review.course))
      .map((l) => ({ topic: l.topic, task: l.task, steps: l.lesson.steps }));
    const { quiz } = await postJson<{ quiz: QuizQuestion[] }>(
      "/api/focus/review",
      { course: review.course, exam: review.exam, lessons },
      "No pude preparar el repaso."
    );
    const latest = loadReviews().find((r) => r.id === review.id);
    if (latest) updateReview({ ...latest, quiz });
    return quiz;
  });
}
