import { describe, expect, it } from "vitest";
import { checkLesson } from "./lessons";

const GOOD = {
  title: "Una cláusula independiente necesita sujeto + verbo",
  body: "Una **cláusula independiente** puede ir sola como oración porque tiene sujeto y verbo principal y expresa una idea completa.\n\n| Texto | ¿Independiente? |\n|---|---|\n| `The bird sings.` | Sí |\n| `Singing at dawn.` | No: falta verbo principal |\n\nTrampa: una palabra en -ing sola no es verbo principal.",
};

describe("checkLesson", () => {
  it("acepta una lección limpia", () => {
    expect(checkLesson(GOOD)).toEqual([]);
  });

  it("detecta la errata 'sssola' y otras letras triples", () => {
    expect(checkLesson({ ...GOOD, body: GOOD.body.replace("ir sola", "sssola") })[0]).toMatch(/letra repetida: sssola/);
  });

  it("detecta codificación rota y palabras duplicadas", () => {
    expect(checkLesson({ ...GOOD, title: "ClÃ¡usula" })).toContain("codificación rota");
    expect(checkLesson({ ...GOOD, body: GOOD.body.replace("puede ir", "puede puede ir") }).join()).toMatch(/palabra repetida/);
  });

  it("exige ejemplo en inglés, español y brevedad", () => {
    expect(checkLesson({ ...GOOD, body: GOOD.body.replace(/`[^`]*`/g, "x") })).toContain("falta un ejemplo en inglés");
    expect(checkLesson({ ...GOOD, body: "Muy corta con `the bird`." }).join()).toMatch(/demasiado corta/);
    expect(checkLesson({ ...GOOD, body: `${GOOD.body} ${"palabra ".repeat(200)}` }).join()).toMatch(/demasiado larga/);
  });

  it("no puede resolver una pregunta concreta", () => {
    expect(checkLesson({ ...GOOD, body: `${GOOD.body} La respuesta correcta es C.` })).toContain("resuelve una pregunta concreta");
  });
});
