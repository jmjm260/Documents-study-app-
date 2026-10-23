import { describe, expect, it } from "vitest";
import { describeReminder, itemsByDay, reminderAt, toCalendarItems, validateEntry, type Entry, type EntryDraft } from "./entries";
import type { Task } from "./tasks";

const draft = (over: Partial<EntryDraft> = {}): EntryDraft => ({
  kind: "examen",
  title: "  Parcial de cálculo ",
  date: "2026-10-28",
  time: "09:30",
  course: " MAT 201 ",
  notes: " Llevar calculadora ",
  reminderSec: 1800,
  ...over,
});

describe("validateEntry", () => {
  it("limpia espacios y acepta una entrada correcta", () => {
    expect(validateEntry(draft())).toEqual({
      ok: true,
      value: { kind: "examen", title: "Parcial de cálculo", date: "2026-10-28", time: "09:30", course: "MAT 201", notes: "Llevar calculadora", reminderSec: 1800 },
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
    ["segundos rotos", { time: "09:30:61" }],
    ["tipo inventado", { kind: "fiesta" as never }],
    ["recordatorio negativo", { reminderSec: -5 }],
    ["recordatorio con decimales", { reminderSec: 2.5 }],
    ["título que no es texto", { title: 42 as never }],
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

describe("recordatorios", () => {
  it("calcula cuándo avisar: 30 min antes de las 09:30", () => {
    const at = reminderAt({ date: "2026-10-28", time: "09:30", reminderSec: 1800 });
    expect(at?.getHours()).toBe(9);
    expect(at?.getMinutes()).toBe(0);
  });

  it("en 'todo el día' cuenta desde las 08:00", () => {
    const at = reminderAt({ date: "2026-10-28", time: null, reminderSec: 3600 });
    expect(at?.getHours()).toBe(7);
  });

  it("sin recordatorio no hay aviso", () => {
    expect(reminderAt({ date: "2026-10-28", time: "09:30", reminderSec: null })).toBeNull();
  });

  it("lo describe en palabras", () => {
    expect([0, 15, 90, 600, 3600, 5400, 7200, 86400].map(describeReminder)).toEqual([
      "A la hora", "15 s antes", "1 min 30 s antes", "10 min antes", "1 hora antes", "1 h 30 min antes", "2 horas antes", "1 día antes",
    ]);
  });

  it("alarma al segundo: 09:30:15 justo a esa hora", () => {
    const at = reminderAt({ date: "2026-10-28", time: "09:30:15", reminderSec: 0 });
    expect([at?.getHours(), at?.getMinutes(), at?.getSeconds()]).toEqual([9, 30, 15]);
  });

  it("las entradas viejas siguen valiendo: sin aviso, o con 'reminder' en minutos", () => {
    const old = { kind: "nota", title: "x", date: "2026-10-28", time: null, course: null, notes: "" };
    const a = validateEntry(old);
    const b = validateEntry({ ...old, reminder: 30 });
    expect(a.ok && a.value.reminderSec).toBeNull();
    expect(b.ok && b.value.reminderSec).toBe(1800);
  });
});
