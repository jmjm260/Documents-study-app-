// Mapa de cursos de Focus (estilo Duolingo): una columna por curso y, en cada una, sus círculos por fecha.
// Lógica pura (sin pantalla ni almacenamiento) para poder probarla.
//
// Qué es cada círculo (Tocorito resuelve la tarea; al estudiante le toca aprenderla):
//   task    → tarea del curso que Tocorito aún no ha resuelto (gris, candado)
//   pending → Tocorito ya la resolvió: te toca la mini lección y el mini test (rojo)
//   lesson  → lección y mini test hechos (color del curso, ✓; se puede repetir)
//   exam    → examen; si hay prueba de repaso, es el trofeo que la abre
import { courseKey } from "./focus";

export type MapLesson = { id: string; course: string; topic: string; completedAt: number };
export type MapReview = { id: string; course: string; exam: string; createdAt: number; doneAt?: number };
export type MapPending = { course: string; topic: string; createdAt: number };
/** Lo que viene del calendario (Canvas o anotado por el estudiante). */
export type MapItem = { id: string; kind: string; title: string; day: string; course: string | null; source: "canvas" | "usuario" };

export type MapNode =
  | { type: "task"; id: string; title: string; date: string; source: "canvas" | "usuario" }
  | { type: "pending"; title: string; date: string }
  | { type: "lesson"; id: string; title: string; date: string }
  | { type: "exam"; id: string; title: string; date: string; reviewId: string | null; reviewDone: boolean };

/** `school`: es una clase de la escuela (sale en el calendario o Canvas). Si no, va a la parte "Libre". */
export type MapColumn = { key: string; name: string; color: string; nodes: MapNode[]; done: number; total: number; school: boolean };

/**
 * Colores de las columnas. Se reparten por orden alfabético de los cursos: así dos cursos nunca
 * comparten color (hasta 7) y cada curso conserva el suyo mientras no cambie la lista de cursos.
 */
export const COURSE_COLORS = ["#0369a1", "#6d28d9", "#be185d", "#0f766e", "#b45309", "#4d7c0f", "#c2410c"];

/** Exámenes de Canvas que llegan como evento o tarea: se reconocen por el título. */
const EXAM_RE = /\b(examen|exam|parcial|midterm|final|quiz|prueba|test)\b/i;
/** Lo de hace más de 2 semanas no sale (Canvas trae todo el semestre). Lo hecho con Tocorito sí, siempre. */
const PAST_DAYS = 14;
const FUTURE_DAYS = 60;

const toDay = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toDay(d.getTime());
}

const ORDER: Record<MapNode["type"], number> = { lesson: 0, pending: 1, task: 2, exam: 3 };

export function buildCourseMap(input: {
  lessons: MapLesson[];
  reviews: MapReview[];
  pending: MapPending | null;
  items: MapItem[];
  today: string;
}): MapColumn[] {
  const from = addDays(input.today, -PAST_DAYS);
  const until = addDays(input.today, FUTURE_DAYS);
  const columns = new Map<string, { name: string; nodes: MapNode[] }>();
  const column = (name: string) => {
    const key = courseKey(name);
    if (!columns.has(key)) columns.set(key, { name: name.trim(), nodes: [] });
    return columns.get(key)!;
  };

  // Clases de la escuela: todo curso que aparece en el calendario (aunque sus tareas sean viejas o lejanas).
  const schoolKeys = new Set(input.items.filter((i) => i.course?.trim()).map((i) => courseKey(i.course!)));

  // Primero el calendario: así el nombre del curso es el de Canvas (o el que puso el estudiante).
  for (const item of input.items) {
    if (!item.course?.trim() || item.day < from || item.day > until) continue;
    const isExam = item.kind === "examen" || (item.source === "canvas" && EXAM_RE.test(item.title));
    if (isExam) column(item.course).nodes.push({ type: "exam", id: item.id, title: item.title, date: item.day, reviewId: null, reviewDone: false });
    else if (item.kind === "tarea") column(item.course).nodes.push({ type: "task", id: item.id, title: item.title, date: item.day, source: item.source });
  }
  for (const l of input.lessons) column(l.course).nodes.push({ type: "lesson", id: l.id, title: l.topic, date: toDay(l.completedAt) });
  if (input.pending) column(input.pending.course).nodes.push({ type: "pending", title: input.pending.topic, date: toDay(input.pending.createdAt) });

  // Cada repaso se cuelga de su examen (el de la fecha que dice el repaso); si no lo hay, se crea el trofeo.
  const latest = new Map<string, MapReview>();
  for (const r of input.reviews) {
    const k = courseKey(r.course);
    if ((latest.get(k)?.createdAt ?? -1) < r.createdAt) latest.set(k, r);
  }
  for (const r of latest.values()) {
    const col = column(r.course);
    const exams = col.nodes.filter((n): n is Extract<MapNode, { type: "exam" }> => n.type === "exam");
    const examDate = /\d{4}-\d{2}-\d{2}/.exec(r.exam)?.[0];
    const target = exams.find((e) => e.date === examDate) ?? exams.find((e) => e.date >= toDay(r.createdAt));
    if (target) {
      target.reviewId = r.id;
      target.reviewDone = Boolean(r.doneAt);
    } else {
      const title = r.exam.split(",")[0]?.trim() || "Examen";
      col.nodes.push({ type: "exam", id: `review:${r.id}`, title, date: examDate ?? toDay(r.createdAt), reviewId: r.id, reviewDone: Boolean(r.doneAt) });
    }
  }

  const alphabetical = [...columns.keys()].sort((a, b) => a.localeCompare(b, "es"));
  return [...columns.entries()]
    .map(([key, { name, nodes }]) => {
      nodes.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type]);
      const done = nodes.filter((n) => n.type === "lesson").length;
      const total = nodes.filter((n) => n.type !== "exam").length;
      const color = COURSE_COLORS[alphabetical.indexOf(key) % COURSE_COLORS.length];
      return { key, name, color, nodes, done, total, school: schoolKeys.has(key) };
    })
    // Primero donde hay algo que hacer (lección pendiente o repaso sin hacer); luego por nombre. "General" al final.
    .sort((a, b) => urgency(b) - urgency(a) || Number(a.key === "general") - Number(b.key === "general") || a.name.localeCompare(b.name, "es"));
}

function urgency(c: MapColumn): number {
  if (c.nodes.some((n) => n.type === "pending")) return 2;
  if (c.nodes.some((n) => n.type === "exam" && n.reviewId && !n.reviewDone)) return 1;
  return 0;
}
