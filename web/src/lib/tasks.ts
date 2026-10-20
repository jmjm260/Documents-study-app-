// Convierte eventos del feed de Canvas en tareas con nivel de contexto.
// Reglas de los niveles: ver .claude/skills/tutor-context-levels/SKILL.md
import type { IcsEvent } from "./ics";

export type ContextLevel = "completo" | "parcial" | "solo_titulo";

export type TaskKind = "tarea" | "evento";

export type Task = {
  id: string;
  title: string;
  course: string | null;
  kind: TaskKind;
  due: string | null;
  allDay: boolean;
  description: string;
  url: string;
  contextLevel: ContextLevel;
};

/** Debajo de esto, la descripción no basta para saber de qué trata la tarea. */
const MIN_USEFUL_DESCRIPTION = 40;

/** Canvas pone el curso al final del título: "Ensayo 1 [ENG 101]". */
export function splitCourse(summary: string): { title: string; course: string | null } {
  const m = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (!m) return { title: summary.trim(), course: null };
  return { title: m[1].trim(), course: m[2].trim() };
}

/** Canvas usa UIDs como "event-assignment-123" para tareas y "event-calendar-event-45" para eventos. */
export function kindFromUid(uid: string): TaskKind {
  return /assignment/i.test(uid) ? "tarea" : "evento";
}

/**
 * El feed nunca da contexto "completo": el enunciado entero y la rúbrica
 * solo llegan por enriquecimiento (extensión, captura, etc.).
 */
export function contextLevelFor(description: string): ContextLevel {
  return description.trim().length >= MIN_USEFUL_DESCRIPTION ? "parcial" : "solo_titulo";
}

export function eventToTask(event: IcsEvent): Task {
  const { title, course } = splitCourse(event.summary);
  return {
    id: event.uid,
    title,
    course,
    kind: kindFromUid(event.uid),
    due: event.start,
    allDay: event.allDay,
    description: event.description,
    url: event.url,
    contextLevel: contextLevelFor(event.description),
  };
}

export function eventsToTasks(events: IcsEvent[]): Task[] {
  return events
    .map(eventToTask)
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}
