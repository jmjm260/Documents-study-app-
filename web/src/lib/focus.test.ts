import { describe, expect, it } from "vitest";
import { extractFocus, MIN_LESSON_SECONDS, parseLesson, stepSeconds, validateFocusRequest } from "./focus";

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
  it("saca la marca y devuelve el tema", () => {
    const { text, focus } = extractFocus('Ahí tienes: x = 5.\nAhora te toca Focus.\n[[FOCUS]]{"tema":"Ecuaciones","tarea":"Resolver 3x + 5 = 20"}[[/FOCUS]]');
    expect(text).toBe("Ahí tienes: x = 5.\nAhora te toca Focus.");
    expect(focus).toEqual({ topic: "Ecuaciones", task: "Resolver 3x + 5 = 20" });
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

describe("validateFocusRequest", () => {
  it("exige tema y tarea, y recorta la solución", () => {
    expect(validateFocusRequest({ topic: "x" })).toBeNull();
    const ok = validateFocusRequest({ topic: " Física ", task: "Caída libre", solution: "a".repeat(5000) });
    expect(ok?.topic).toBe("Física");
    expect(ok?.solution).toHaveLength(4000);
  });
});
