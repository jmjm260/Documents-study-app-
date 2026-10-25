import { describe, expect, it } from "vitest";
import {
  extractFocus,
  extractReview,
  lessonIndexText,
  MIN_LESSON_SECONDS,
  parseLesson,
  parseReview,
  sameCourse,
  stepSeconds,
  validateFocusRequest,
  validateLessonIndex,
  validateReviewRequest,
} from "./focus";

const LESSON = {
  titulo: "Ecuaciones",
  pasos: [
    { titulo: "Qué es", texto: "Una igualdad con una incógnita." },
    { titulo: "Despejar", texto: "Pasas el 5 restando: $3x = 15$." },
    { titulo: "Error típico", texto: "Olvidar cambiar el signo." },
  ],
  prueba: [
    { pregunta: "Si 2x + 4 = 10, x = ?", opciones: ["2", "3", "4", "7"], correcta: 1, explicacion: "2x = 6, x = 3." },
    { pregunta: "Mala", opciones: ["a", "b"], correcta: 5, explicacion: "" },
  ],
};

describe("extractFocus", () => {
  it("saca la marca y devuelve clase, tema y tarea", () => {
    const { text, focus } = extractFocus(
      'Ahí tienes: x = 5.\nAhora te toca Focus.\n[[FOCUS]]{"clase":"Álgebra","tema":"Ecuaciones","tarea":"Resolver 3x + 5 = 20"}[[/FOCUS]]'
    );
    expect(text).toBe("Ahí tienes: x = 5.\nAhora te toca Focus.");
    expect(focus).toEqual({ course: "Álgebra", topic: "Ecuaciones", task: "Resolver 3x + 5 = 20" });
  });

  it("sin clase: queda en General", () => {
    expect(extractFocus('[[FOCUS]]{"tema":"Ecuaciones","tarea":"x"}[[/FOCUS]]').focus?.course).toBe("General");
  });

  it("sin marca, o mal escrita, no hay Focus", () => {
    expect(extractFocus("Hola").focus).toBeNull();
    const broken = extractFocus("Listo [[FOCUS]]{tema: roto}[[/FOCUS]]");
    expect(broken.focus).toBeNull();
    expect(broken.text).toBe("Listo");
  });

  it("le falta la tarea: no vale", () => {
    expect(extractFocus('[[FOCUS]]{"tema":"Física"}[[/FOCUS]]').focus).toBeNull();
  });
});

describe("parseLesson", () => {
  it("lee el JSON aunque venga con ``` alrededor y descarta preguntas inválidas", () => {
    const lesson = parseLesson("```json\n" + JSON.stringify(LESSON) + "\n```");
    expect(lesson?.steps).toHaveLength(3);
    expect(lesson?.quiz).toHaveLength(1);
    expect(lesson?.quiz[0].answer).toBe(1);
  });

  it("sin pasos o sin prueba no hay lección", () => {
    expect(parseLesson(JSON.stringify({ ...LESSON, prueba: [] }))).toBeNull();
    expect(parseLesson(JSON.stringify({ ...LESSON, pasos: [LESSON.pasos[0]] }))).toBeNull();
    expect(parseLesson("no es json")).toBeNull();
  });

  it("los pasos suman al menos el tiempo mínimo", () => {
    const lesson = parseLesson(JSON.stringify(LESSON))!;
    expect(stepSeconds(lesson) * lesson.steps.length).toBeGreaterThanOrEqual(MIN_LESSON_SECONDS);
  });
});

describe("repaso", () => {
  it("extractReview saca la clase y limpia el texto", () => {
    const r = extractReview('Anotado. Te dejé un repaso en Focus.\n[[REPASO]]{"clase":"Álgebra"}[[/REPASO]]');
    expect(r).toEqual({ text: "Anotado. Te dejé un repaso en Focus.", review: "Álgebra" });
    expect(extractReview("Hola").review).toBeNull();
  });

  it("misma clase sin importar tildes ni mayúsculas", () => {
    expect(sameCourse("Física I", "fisica  i")).toBe(true);
    expect(sameCourse("Física", "Química")).toBe(false);
  });

  it("índice de lecciones: valida y agrupa por clase", () => {
    const index = validateLessonIndex([
      { course: "Álgebra", topic: "Ecuaciones" },
      { course: "Álgebra", topic: "Fracciones" },
      { course: "Física", topic: "Caída libre" },
      { course: "", topic: "sin clase" },
      "basura",
    ]);
    expect(index).toHaveLength(3);
    expect(lessonIndexText(index)).toBe("Lecciones guardadas en Focus:\n- Álgebra: Ecuaciones; Fracciones\n- Física: Caída libre");
    expect(lessonIndexText([])).toContain("(ninguna)");
  });

  it("petición de repaso: exige clase y alguna lección con pasos", () => {
    expect(validateReviewRequest({ course: "Álgebra", lessons: [] })).toBeNull();
    const ok = validateReviewRequest({
      course: "Álgebra",
      exam: "Examen, 2026-10-30",
      lessons: [{ topic: "Ecuaciones", task: "3x+5=20", steps: [{ heading: "Despejar", body: "Resta 5." }] }],
    });
    expect(ok?.lessons[0].steps).toHaveLength(1);
  });

  it("parseReview necesita al menos 3 preguntas válidas", () => {
    const q = { pregunta: "¿?", opciones: ["a", "b", "c", "d"], correcta: 2, explicacion: "" };
    expect(parseReview(JSON.stringify({ prueba: [q, q] }))).toBeNull();
    expect(parseReview(JSON.stringify({ prueba: [q, q, q, q] }))).toHaveLength(4);
  });
});

describe("validateFocusRequest", () => {
  it("exige tema y tarea, y recorta la solución", () => {
    expect(validateFocusRequest({ topic: "x" })).toBeNull();
    const ok = validateFocusRequest({ topic: " Física ", task: "Caída libre", solution: "a".repeat(5000) });
    expect(ok?.topic).toBe("Física");
    expect(ok?.solution).toHaveLength(4000);
  });
});
