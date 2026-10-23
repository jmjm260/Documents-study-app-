// Focus pendiente en ESTE dispositivo (localStorage). Mientras haya uno, el chat queda bloqueado.
// Con cuentas, irá al servidor (en la web, borrar los datos del navegador lo saltaría).
import type { FocusTopic, Lesson } from "./focus";

const KEY = "tocorito.focus.v1";
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

export function loadFocus(): FocusState | null {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "null") as FocusState | null;
    return data && typeof data.id === "string" && typeof data.topic === "string" ? data : null;
  } catch {
    return null;
  }
}

export function saveFocus(state: FocusState | null) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch {
    // Sin almacenamiento: dura mientras la pantalla esté abierta.
  }
  window.dispatchEvent(new Event(FOCUS_EVENT));
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

// Una sola petición por Focus, aunque la pidan el chat (por adelantado) y la pantalla de Focus a la vez.
const inflight = new Map<string, Promise<Lesson>>();

export function prefetchLesson(state: FocusState): Promise<Lesson> {
  if (state.lesson) return Promise.resolve(state.lesson);
  let p = inflight.get(state.id);
  if (!p) {
    p = fetch("/api/focus/lesson", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic: state.topic, task: state.task, solution: state.solution }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.lesson) throw new Error(data.error ?? "No pude preparar la lección.");
        const lesson = data.lesson as Lesson;
        const latest = loadFocus();
        if (latest?.id === state.id) saveFocus({ ...latest, lesson });
        return lesson;
      })
      .finally(() => inflight.delete(state.id));
    inflight.set(state.id, p);
  }
  return p;
}
