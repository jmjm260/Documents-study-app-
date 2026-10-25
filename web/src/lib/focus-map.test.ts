import { describe, expect, it } from "vitest";
import { buildCourseMap, type MapItem } from "./focus-map";

const day = (s: string) => new Date(`${s}T10:00:00`).getTime();
const item = (p: Partial<MapItem> & Pick<MapItem, "title" | "day">): MapItem => ({ id: p.title, kind: "tarea", course: "Cálculo I", source: "canvas", ...p });

describe("buildCourseMap", () => {
  const today = "2026-10-25";

  it("una columna por curso, con el nombre de Canvas aunque la lección lo escriba distinto", () => {
    const cols = buildCourseMap({
      today,
      lessons: [{ id: "l1", course: "calculo i", topic: "Por partes", completedAt: day("2026-10-23") }],
      reviews: [],
      pending: null,
      items: [item({ title: "Tarea 4", day: "2026-10-26" }), item({ title: "Lab 2", day: "2026-10-29", course: "Física" })],
    });
    expect(cols.map((c) => c.name)).toEqual(["Cálculo I", "Física"]);
    expect(cols[0].nodes.map((n) => `${n.type}:${n.title}`)).toEqual(["lesson:Por partes", "task:Tarea 4"]);
    expect(cols[0]).toMatchObject({ done: 1, total: 2 });
  });

  it("reconoce exámenes de Canvas por el título y les cuelga su repaso", () => {
    const cols = buildCourseMap({
      today,
      lessons: [{ id: "l1", course: "Cálculo I", topic: "Por partes", completedAt: day("2026-10-23") }],
      reviews: [{ id: "r1", course: "Cálculo I", exam: "Examen parcial, 2026-11-06", createdAt: day("2026-10-25") }],
      pending: null,
      items: [item({ title: "Examen parcial", day: "2026-11-06", kind: "evento" })],
    });
    const exam = cols[0].nodes.at(-1);
    expect(exam).toMatchObject({ type: "exam", reviewId: "r1", reviewDone: false });
    expect(cols[0].total).toBe(1); // los exámenes no cuentan como lección
  });

  it("repaso sin examen en el calendario: aparece su trofeo igual", () => {
    const cols = buildCourseMap({
      today,
      lessons: [{ id: "l1", course: "Álgebra", topic: "Ecuaciones", completedAt: day("2026-10-20") }],
      reviews: [{ id: "r1", course: "Álgebra", exam: "Prueba de álgebra, 2026-10-29", createdAt: day("2026-10-25"), doneAt: day("2026-10-25") }],
      pending: null,
      items: [],
    });
    expect(cols[0].nodes.at(-1)).toMatchObject({ type: "exam", title: "Prueba de álgebra", date: "2026-10-29", reviewDone: true });
  });

  it("la lección pendiente sale en su curso y ese curso va primero", () => {
    const cols = buildCourseMap({
      today,
      lessons: [],
      reviews: [],
      pending: { course: "Química", topic: "Moles", createdAt: day("2026-10-25") },
      items: [item({ title: "Tarea 1", day: "2026-10-27", course: "Biología" })],
    });
    expect(cols[0]).toMatchObject({ name: "Química", nodes: [{ type: "pending", title: "Moles" }] });
  });

  it("no enseña lo muy viejo ni lo muy lejano de Canvas, ni lo que no tiene curso", () => {
    const cols = buildCourseMap({
      today,
      lessons: [],
      reviews: [],
      pending: null,
      items: [
        item({ title: "Vieja", day: "2026-09-01" }),
        item({ title: "Lejana", day: "2027-03-01" }),
        item({ title: "Sin curso", day: "2026-10-27", course: null }),
        item({ title: "Nota", day: "2026-10-27", kind: "nota", source: "usuario" }),
      ],
    });
    expect(cols).toEqual([]);
  });

  it("separa Escuela (clases del calendario) de Libre (lo demás)", () => {
    const cols = buildCourseMap({
      today,
      lessons: [
        { id: "l1", course: "Cálculo I", topic: "Por partes", completedAt: day("2026-10-23") },
        { id: "l2", course: "General", topic: "Cómo funciona un motor", completedAt: day("2026-10-24") },
      ],
      reviews: [],
      pending: null,
      // La tarea es vieja (no sale como círculo), pero basta para saber que Cálculo I es de la escuela.
      items: [item({ title: "Tarea 1", day: "2026-08-01" })],
    });
    expect(cols.filter((c) => c.school).map((c) => c.name)).toEqual(["Cálculo I"]);
    expect(cols.filter((c) => !c.school).map((c) => c.name)).toEqual(["General"]);
  });

  it("cada curso tiene un color distinto", () => {
    const names = ["Cálculo", "Física", "Historia", "Inglés", "Química"];
    const cols = buildCourseMap({ today, lessons: [], reviews: [], pending: null, items: names.map((n) => item({ title: "T", day: "2026-10-27", course: n })) });
    expect(new Set(cols.map((c) => c.color)).size).toBe(names.length);
  });
});
