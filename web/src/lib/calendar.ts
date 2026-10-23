// Lógica del calendario mensual (sin dependencias). Semanas de lunes a domingo.
import type { Task } from "./tasks";

export const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/** Fecha local como "YYYY-MM-DD" (no usamos toISOString porque pasa a UTC y cambia el día). */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 42 días (6 semanas) que cubren el mes, empezando en lunes. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  return Array.from({ length: 42 }, (_, i) => new Date(year, month, 1 - offset + i));
}

/** Día local en que vence la tarea. Las de día completo ya vienen como "YYYY-MM-DD". */
export function taskDayKey(task: Task): string | null {
  if (!task.due) return null;
  if (task.allDay || task.due.length === 10) return task.due.slice(0, 10);
  // Sin "Z" la hora es local del feed: la tratamos como local.
  const date = new Date(task.due);
  return Number.isNaN(date.getTime()) ? null : dayKey(date);
}

export function groupByDay(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = taskDayKey(task);
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), task]);
  }
  return map;
}

export function monthTitle(year: number, month: number): string {
  const text = new Date(year, month, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}
