import { describe, expect, it } from "vitest";
import { itemsByDay, toCalendarItems, validateEntry, type Entry, type EntryDraft } from "./entries";
import type { Task } from "./tasks";

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  kind: "examen",
  title: "  Parcial de cálculo ",
  date: "2026-10-28",
  time: "09:30",
  course: " MAT 201 ",
  notes: " Llevar calculadora ",
  ...over,
});

describe("validateEntry", () => {
  it("limpia espacios y acepta una entrada correcta", () => {
    expect(validateEntry(draft())).toEqual({
      ok: true,
      value: { kind: "examen", title: "Parcial de cálculo", date: "2026-10-28", time: "09:30", course: "MAT 201", notes: "Llevar calculadora" },
    });
  });

  it("materia vacía queda en null y la hora puede ser 'todo el día'", () => {
    const r = validateEntry(draft({ course: "  ", time: null }));
    expect(r.ok && r.value.course).toBeNull();
    expect(r.ok && r.value.time).toBeNull();
  });

  it.each([
    ["sin título", { title: "   " }],
    ["título larguísimo", { title: "x".repeat(121) }],
    ["fecha rota", { date: "28/10/2026" }],
    ["hora rota", { time: "25:00" }],
    ["tipo inventado", { kind: "fiesta" as never }],
  ])("rechaza: %s", (_, over) => {
    expect(validateEntry(draft(over)).ok).toBe(false);
  });
});

describe("toCalendarItems + itemsByDay", () => {
  const task: Task = {
    id: "event-assignment-1",
    title: "Ensayo",
    course: "ENG 101",
    kind: "tarea",
    due: "2026-10-28T17:59:00",
    allDay: false,
    description: "",
    url: "https://x.instructure.com/a/1",
    contextLevel: "solo_titulo",
  };
  const entry: Entry = { id: "e1", ...draft(), title: "Parcial", course: "MAT 201", notes: "", time: "09:30" };
  const allDay: Entry = { ...entry, id: "e2", kind: "nota", title: "Llevar bata", time: null };

  it("junta Canvas y lo del usuario en el mismo día, ordenado por hora", () => {
    const day = itemsByDay(toCalendarItems([task], [entry, allDay])).get("2026-10-28")!;
    expect(day.map((i) => [i.title, i.source, i.time])).toEqual([
      ["Llevar bata", "usuario", null],
      ["Parcial", "usuario", "09:30"],
      ["Ensayo", "canvas", "17:59"],
    ]);
  });

  it("los eventos de Canvas que no son tareas salen como 'evento'", () => {
    const [item] = toCalendarItems([{ ...task, kind: "evento", due: "2026-10-30", allDay: true }], []);
    expect(item).toMatchObject({ kind: "evento", day: "2026-10-30", time: null });
  });
});
