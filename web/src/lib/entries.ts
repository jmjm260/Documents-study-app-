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
  /** Minutos antes para avisar, o null = sin aviso. En "todo el día" cuenta desde las 08:00. */
  reminder: number | null;
};

export type EntryDraft = Omit<Entry, "id">;

export const ENTRY_LIMITS = { title: 120, course: 40, notes: 2000, reminder: 7 * 24 * 60 };

/** Hora base de los avisos para lo que es "todo el día". */
export const ALL_DAY_REMINDER_TIME = "08:00";

export const REMINDER_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440];

export function describeReminder(minutes: number): string {
  if (minutes === 0) return "A la hora";
  if (minutes % 1440 === 0) return minutes === 1440 ? "1 día antes" : `${minutes / 1440} días antes`;
  if (minutes % 60 === 0) return minutes === 60 ? "1 hora antes" : `${minutes / 60} horas antes`;
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min antes`;
  return `${minutes} min antes`;
}

/** Momento exacto (hora local) en que debe sonar el aviso, o null si no tiene. */
export function reminderAt(entry: Pick<Entry, "date" | "time" | "reminder">): Date | null {
  if (entry.reminder === null) return null;
  const start = new Date(`${entry.date}T${entry.time ?? ALL_DAY_REMINDER_TIME}:00`);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() - entry.reminder * 60_000);
}

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
// Acepta "unknown" porque también valida lo que propone Tocorito o lo leído del almacenamiento.
export function validateEntry(input: unknown): { ok: true; value: EntryDraft } | { ok: false; error: string } {
  const draft = (input ?? {}) as Partial<Record<keyof EntryDraft, unknown>>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const title = str(draft.title).trim();
  const course = str(draft.course).trim() || null;
  const notes = str(draft.notes).trim();
  const time = draft.time === null || draft.time === undefined || draft.time === "" ? null : draft.time;
  const reminder = draft.reminder === null || draft.reminder === undefined ? null : draft.reminder;
  if (!["tarea", "examen", "nota"].includes(draft.kind as string)) return { ok: false, error: "Tipo no válido." };
  if (!title) return { ok: false, error: "Escribe un título." };
  if (title.length > ENTRY_LIMITS.title) return { ok: false, error: `El título puede tener hasta ${ENTRY_LIMITS.title} caracteres.` };
  if (course && course.length > ENTRY_LIMITS.course) return { ok: false, error: `La materia puede tener hasta ${ENTRY_LIMITS.course} caracteres.` };
  if (notes.length > ENTRY_LIMITS.notes) return { ok: false, error: `La nota puede tener hasta ${ENTRY_LIMITS.notes} caracteres.` };
  const date = str(draft.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, error: "Elige una fecha." };
  if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return { ok: false, error: "Hora no válida." };
  if (reminder !== null && (!Number.isInteger(reminder) || (reminder as number) < 0 || (reminder as number) > ENTRY_LIMITS.reminder)) {
    return { ok: false, error: "Recordatorio no válido." };
  }
  return {
    ok: true,
    value: { kind: draft.kind as EntryKind, title, date, time: time as string | null, course, notes, reminder: reminder as number | null },
  };
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

// --- Almacenamiento en el dispositivo (en la app nativa: almacenamiento local de la app) ---

const STORAGE_KEY = "tocorito.entries.v1";
const CANVAS_CACHE_KEY = "tocorito.canvasCache.v1";

/** Evento que avisa a las demás pantallas (y a los recordatorios) de que algo cambió. */
export const ENTRIES_CHANGED = "tocorito:entries-changed";

export function loadEntries(): Entry[] {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data.flatMap((e) => {
      const r = typeof e?.id === "string" ? validateEntry(e) : null;
      return r?.ok ? [{ ...r.value, id: e.id as string }] : [];
    });
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
  window.dispatchEvent(new Event(ENTRIES_CHANGED));
}

export function addEntries(drafts: EntryDraft[]): Entry[] {
  const created = drafts.map((d) => ({ ...d, id: newEntryId() }));
  saveEntries([...loadEntries(), ...created]);
  return created;
}

export function removeEntry(id: string) {
  saveEntries(loadEntries().filter((e) => e.id !== id));
}

/** Copia de lo último que trajo Canvas, para que Tocorito y el calendario lo vean al instante. */
export function loadCanvasCache(): Task[] {
  try {
    const data = JSON.parse(localStorage.getItem(CANVAS_CACHE_KEY) ?? "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveCanvasCache(tasks: Task[] | null) {
  try {
    if (tasks) localStorage.setItem(CANVAS_CACHE_KEY, JSON.stringify(tasks));
    else localStorage.removeItem(CANVAS_CACHE_KEY);
  } catch {
    // Sin almacenamiento: no pasa nada, se vuelve a descargar.
  }
}

export function newEntryId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
