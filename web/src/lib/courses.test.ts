import { describe, expect, it } from "vitest";
import {
  courseProgress,
  currentLesson,
  isUnitTestUnlocked,
  isUnlocked,
  nextLesson,
  outlineToCourse,
  parseOutline,
  validateCourseLessonRequest,
  validateCourseRequest,
  type Course,
} from "./courses";

const OUTLINE = {
  titulo: "Python desde cero",
  unidades: [
    { titulo: "Primeros pasos", lecciones: [{ titulo: "Hola mundo", objetivo: "Imprimir texto" }, { titulo: "Variables", objetivo: "Guardar datos" }] },
    { titulo: "Decisiones", lecciones: [{ titulo: "if", objetivo: "Elegir" }, { titulo: "else", objetivo: "Si no" }] },
  ],
};

function course(): Course {
  const outline = parseOutline(JSON.stringify(OUTLINE));
  if (!outline || "refusal" in outline) throw new Error("índice inválido");
  return outlineToCourse(outline, "python", "principiante", "c1", 0);
}

describe("parseOutline", () => {
  it("lee el índice aunque venga con ``` alrededor", () => {
    const outline = parseOutline("```json\n" + JSON.stringify(OUTLINE) + "\n```");
    expect(outline).toMatchObject({ title: "Python desde cero", units: [{ title: "Primeros pasos" }, { title: "Decisiones" }] });
  });

  it("devuelve el rechazo de Tocorito si el tema no es apropiado", () => {
    expect(parseOutline('{"rechazo":"Eso no lo enseño, asere."}')).toEqual({ refusal: "Eso no lo enseño, asere." });
  });

  it("descarta unidades sin lecciones suficientes; con menos de 2 unidades no hay curso", () => {
    expect(parseOutline(JSON.stringify({ titulo: "X", unidades: [OUTLINE.unidades[0], { titulo: "Vacía", lecciones: [] }] }))).toBeNull();
    expect(parseOutline("nada")).toBeNull();
  });
});

describe("progreso", () => {
  it("al empezar solo está abierta la primera lección", () => {
    const c = course();
    expect(currentLesson(c)).toEqual({ unit: 0, lesson: 0 });
    expect(isUnlocked(c, { unit: 0, lesson: 0 })).toBe(true);
    expect(isUnlocked(c, { unit: 0, lesson: 1 })).toBe(false);
    expect(isUnitTestUnlocked(c, 0)).toBe(false);
  });

  it("al hacer una lección se abre la siguiente, también en la unidad siguiente", () => {
    const c = course();
    c.units[0].lessons[0].doneAt = 1;
    c.units[0].lessons[1].doneAt = 2;
    expect(isUnitTestUnlocked(c, 0)).toBe(true);
    expect(currentLesson(c)).toEqual({ unit: 1, lesson: 0 });
    expect(isUnlocked(c, { unit: 1, lesson: 0 })).toBe(true);
    expect(isUnlocked(c, { unit: 1, lesson: 1 })).toBe(false);
    expect(courseProgress(c)).toEqual({ done: 2, total: 4 });
  });

  it("siguiente lección: dentro de la unidad, a la unidad siguiente y nada tras la última", () => {
    const c = course();
    expect(nextLesson(c, { unit: 0, lesson: 0 })).toEqual({ unit: 0, lesson: 1 });
    expect(nextLesson(c, { unit: 0, lesson: 1 })).toEqual({ unit: 1, lesson: 0 });
    expect(nextLesson(c, { unit: 1, lesson: 1 })).toBeNull();
  });

  it("curso terminado: no hay lección actual", () => {
    const c = course();
    c.units.forEach((u) => u.lessons.forEach((l) => (l.doneAt = 1)));
    expect(currentLesson(c)).toBeNull();
  });
});

describe("validación", () => {
  it("pedido de curso: tema mínimo y nivel válido", () => {
    expect(validateCourseRequest({ topic: "ab" })).toBeNull();
    expect(validateCourseRequest({ topic: "guitarra", level: "experto" })).toEqual({ topic: "guitarra", level: "principiante" });
  });

  it("pedido de lección: exige curso, unidad y título", () => {
    expect(validateCourseLessonRequest({ course: "Python", unit: "U1" })).toBeNull();
    expect(validateCourseLessonRequest({ course: "Python", unit: "U1", title: "if", previous: ["Hola", ""] })?.previous).toEqual(["Hola"]);
  });
});
