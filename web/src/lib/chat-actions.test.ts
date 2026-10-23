import { describe, expect, it } from "vitest";
import { actionNote, calendarPrompt, extractActions, MAX_ACTIONS, validateContext } from "./chat-actions";

const block = (o: object) => `[[CALENDARIO]]${JSON.stringify(o)}[[/CALENDARIO]]`;
const exam = { tipo: "examen", titulo: "Prueba de física", fecha: "2026-10-28", hora: "09:30", materia: "FIS 210", notas: "", recordatorio_min: 30 };

describe("extractActions", () => {
  it("saca el bloque del texto y lo convierte en anotación", () => {
    const r = extractActions(`Listo, anotado ☕\n${block(exam)}`);
    expect(r.text).toBe("Listo, anotado ☕");
    expect(r.actions).toEqual([
      { kind: "examen", title: "Prueba de física", date: "2026-10-28", time: "09:30", course: "FIS 210", notes: "", reminderSec: 1800 },
    ]);
    expect(r.rejected).toBe(0);
  });

  it("acepta campos que falten (todo el día, sin aviso)", () => {
    const r = extractActions(block({ tipo: "nota", titulo: "Llevar bata", fecha: "2026-10-27" }));
    expect(r.actions[0]).toMatchObject({ time: null, reminderSec: null, course: null, notes: "" });
  });

  it("rechaza bloques rotos o inválidos sin romper el resto", () => {
    const r = extractActions(`a ${block(exam)} ${block({ ...exam, fecha: "mañana" })} [[CALENDARIO]]{no json[[/CALENDARIO]] b`);
    expect(r.actions).toHaveLength(1);
    expect(r.rejected).toBe(2);
    expect(r.text).toBe("a b");
  });

  it(`como mucho ${MAX_ACTIONS} anotaciones por respuesta`, () => {
    const r = extractActions(Array.from({ length: 8 }, () => block(exam)).join("\n"));
    expect(r.actions).toHaveLength(MAX_ACTIONS);
    expect(r.rejected).toBe(3);
  });

  it("alarma relativa con segundos y aviso justo a la hora", () => {
    const r = extractActions(block({ tipo: "nota", titulo: "Alarma", fecha: "2026-10-23", hora: "15:02:30", recordatorio_seg: 0 }));
    expect(r.actions[0]).toMatchObject({ time: "15:02:30", reminderSec: 0 });
  });

  it("texto sin bloques queda igual", () => {
    expect(extractActions("hola asere")).toEqual({ text: "hola asere", actions: [], rejected: 0 });
  });
});

describe("validateContext", () => {
  it("acepta un contexto correcto y recorta lo raro", () => {
    const ctx = validateContext({
      now: "2026-10-23T14:05:33",
      timezone: "America/New_York",
      upcoming: [
        { date: "2026-10-27", time: "12:00", kind: "tarea", title: "  Lab   de fluidos ", course: "FIS 210" },
        { date: "nunca", title: "malo" },
        { date: "2026-10-28", time: "99:99", kind: "examen", title: "Parcial", course: "" },
      ],
    });
    expect(ctx).toEqual({
      now: "2026-10-23T14:05:33",
      timezone: "America/New_York",
      upcoming: [
        { date: "2026-10-27", time: "12:00", kind: "tarea", title: "Lab de fluidos", course: "FIS 210" },
        { date: "2026-10-28", time: null, kind: "examen", title: "Parcial", course: null },
      ],
    });
  });

  it("sin fecha válida no hay contexto", () => {
    expect(validateContext({ now: "ayer" })).toBeNull();
    expect(validateContext(null)).toBeNull();
  });
});

describe("calendarPrompt", () => {
  it("le dice a Tocorito qué día es y cómo se llaman los próximos días", () => {
    const p = calendarPrompt({ now: "2026-10-23T14:05", timezone: "America/New_York", upcoming: [] });
    expect(p).toContain("viernes 23 de octubre de 2026, 14:05");
    expect(p).toContain("jueves 29 de octubre = 2026-10-29");
    expect(p).toContain("(nada anotado)");
  });
});

describe("actionNote", () => {
  it("resume lo anotado para el historial", () => {
    const [draft] = extractActions(block(exam)).actions;
    expect(actionNote(draft)).toBe('[Anotado en el calendario: Examen "Prueba de física" el 2026-10-28 09:30, aviso 30 min antes]');
  });
});
