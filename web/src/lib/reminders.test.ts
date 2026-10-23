import { describe, expect, it } from "vitest";
import type { Entry } from "./entries";
import { dueReminders, nextReminderAt, reminderText } from "./reminders";

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: "e1",
  kind: "examen",
  title: "Física",
  date: "2026-10-28",
  time: "09:30",
  course: null,
  notes: "",
  reminder: 30,
  ...over,
});

const at = (hhmm: string) => new Date(`2026-10-28T${hhmm}:00`);

describe("dueReminders", () => {
  it("avisa cuando llega la hora (09:00 para 30 min antes de las 09:30)", () => {
    expect(dueReminders([entry()], at("08:59"), new Set())).toHaveLength(0);
    expect(dueReminders([entry()], at("09:00"), new Set())).toHaveLength(1);
  });

  it("no repite un aviso ya mostrado", () => {
    const [due] = dueReminders([entry()], at("09:01"), new Set());
    expect(dueReminders([entry()], at("09:02"), new Set([due.key]))).toHaveLength(0);
  });

  it("si la app se abre muy tarde, no avisa de algo viejo", () => {
    expect(dueReminders([entry()], at("09:20"), new Set())).toHaveLength(0);
  });

  it("si cambias la hora del examen, vuelve a avisar", () => {
    const [due] = dueReminders([entry()], at("09:00"), new Set());
    expect(dueReminders([entry({ time: "10:30" })], at("10:00"), new Set([due.key]))).toHaveLength(1);
  });
});

describe("nextReminderAt", () => {
  it("devuelve el aviso futuro más cercano", () => {
    const list = [entry({ id: "a", time: "12:00" }), entry({ id: "b", time: "10:00" }), entry({ id: "c", reminder: null })];
    expect(nextReminderAt(list, at("08:00"))?.getHours()).toBe(9); // 10:00 - 30 min
  });
});

describe("reminderText", () => {
  it("describe el aviso en español", () => {
    expect(reminderText(entry())).toEqual({ title: "⏰ Examen: Física", body: "Empieza a las 09:30 · aviso 30 min antes." });
  });
});
