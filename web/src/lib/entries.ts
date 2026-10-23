// Anotaciones propias del usuario en el calendario (tareas, exámenes, notas) y la vista unificada
// con lo que llega de Canvas. Hoy se guardan en el dispositivo; con cuentas se sincronizarán.
import { taskDayKey } from "./calendar";
import type { ContextLevel, Task } from "./tasks";

export type EntryKind = "tarea" | "examen" | "nota";

export type Entry = {
  id: string;
  kind: EntryKind;
  title: string;
  date: string; // "YYYY-MM-DD"
  time: string | null; // "HH:MM" o null = todo el día
  course: string | null;
  notes: string;
};

export type EntryDraft = Omit<Entry, "id">;

export const ENTRY_LIMITS = { title: 120, course: 40, notes: 2000 };

export const KIND_INFO = {
  tarea: { label: "Tarea", color: "#1450d8" },
  examen: { label: "Examen", color: "#e5262b" },
  nota: { label: "Nota", color: "#f59e0b" },
  evento: { label: "Evento", color: "#0b1840" },
} as const;

export type ItemKind = keyof typeof KIND_INFO;

/** Lo que pinta el calendario: venga de Canvas o del usuario. */
export type CalendarItem = {
  id: string;
  source: "canvas" | "usuario";
  kind: ItemKind;
  title: string;
  day: string;
  time: string | null; // "HH:MM" local o null = todo el día
  course: string | null;
  description: string;
  url: string | null;
  contextLevel: ContextLevel | null;
  entry: Entry | null;
};

/** Devuelve el borrador limpio o un mensaje de error para mostrar al usuario. */
export function validateEntry(draft: EntryDraft): { ok: true; value: EntryDraft } | { ok: false; error: string } {
  const title = draft.title.trim();
  const course = draft.course?.trim() || null;
  const notes = draft.notes.trim();
  if (!["tarea", "examen", "nota"].includes(draft.kind)) return { ok: false, error: "Tipo no válido." };
  if (!title) return { ok: false, error: "Escribe un título." };
  if (title.length > ENTRY_LIMITS.title) return { ok: false, error: `El título puede tener hasta ${ENTRY_LIMITS.title} caracteres.` };
  if (course && course.length > ENTRY_LIMITS.course) return { ok: false, error: `La materia puede tener hasta ${ENTRY_LIMITS.course} caracteres.` };
  if (notes.length > ENTRY_LIMITS.notes) return { ok: false, error: `La nota puede tener hasta ${ENTRY_LIMITS.notes} caracteres.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) return { ok: false, error: "Elige una fecha." };
  if (draft.time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return { ok: false, error: "Hora no válida." };
  return { ok: true, value: { kind: draft.kind, title, date: draft.date, time: draft.time, course, notes } };
}

function canvasTime(task: Task): string | null {
  if (!task.due || task.allDay || task.due.length === 10) return null;
  const d = new Date(task.due);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function toCalendarItems(tasks: Task[], entries: Entry[]): CalendarItem[] {
  const fromCanvas: CalendarItem[] = tasks.flatMap((task) => {
    const day = taskDayKey(task);
    if (!day) return [];
    return [{
      id: `canvas:${task.id}`,
      source: "canvas",
      kind: task.kind === "tarea" ? "tarea" : "evento",
      title: task.title,
      day,
      time: canvasTime(task),
      course: task.course,
      description: task.description,
      url: task.url || null,
      contextLevel: task.contextLevel,
      entry: null,
    }];
  });
  const fromUser: CalendarItem[] = entries.map((entry) => ({
    id: `usuario:${entry.id}`,
    source: "usuario",
    kind: entry.kind,
    title: entry.title,
    day: entry.date,
    time: entry.time,
    course: entry.course,
    description: entry.notes,
    url: null,
    contextLevel: null,
    entry,
  }));
  return [...fromCanvas, ...fromUser];
}

/** Agrupa por día; dentro del día: primero "todo el día", luego por hora. */
export function itemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) map.set(item.day, [...(map.get(item.day) ?? []), item]);
  for (const list of map.values()) {
    list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title));
  }
  return map;
}

const STORAGE_KEY = "tocorito.entries.v1";

export function loadEntries(): Entry[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter((e) => typeof e?.id === "string" && validateEntry(e).ok) : [];
  } catch {
    return [];
  }
}

export function saveEntries(entries: Entry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Sin almacenamiento (modo privado): las notas viven mientras la pantalla esté abierta.
  }
}

export function newEntryId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
