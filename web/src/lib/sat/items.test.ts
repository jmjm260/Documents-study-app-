import { describe, expect, it } from "vitest";
import { fingerprint, isDuplicate, leaksAnswer, publicItem, skeleton, validateItem, type SatItem } from "./items";

const RAW = {
  family: 2,
  micros: ["F2.1"],
  difficulty: 1,
  passage: "The collection of rare maps, which the museum acquired last year, ______ now on display in the east wing.",
  question: "Which choice completes the text so that it conforms to the conventions of Standard English?",
  options: [{ text: "is" }, { text: "are" }, { text: "were" }, { text: "have been" }],
  correct: "A",
  explanation: "El sujeto es 'collection' (singular), no 'maps'.",
  distractors: { B: "Plural: concuerda con 'maps', no con el sujeto.", C: "Plural y pasado.", D: "Plural." },
  verification: "Sujeto singular 'The collection' → verbo singular 'is'.",
};
const EXPECTED = { family: 2, micro: "F2.1", difficulty: 1 };

function item(raw: Record<string, unknown> = RAW): SatItem {
  const r = validateItem(raw, EXPECTED);
  if ("error" in r) throw new Error(r.error);
  return { ...r.item, id: "x", version: 1, fp: fingerprint(r.item), status: "validated", createdAt: 0 };
}

describe("validateItem", () => {
  it("acepta una pregunta bien formada", () => {
    expect("item" in validateItem(RAW, EXPECTED)).toBe(true);
  });

  it("rechaza opciones repetidas, clave inválida y distractores sin razón", () => {
    expect(validateItem({ ...RAW, options: [{ text: "is" }, { text: "Is" }, { text: "were" }, { text: "be" }] }, EXPECTED)).toEqual({ error: "hay opciones repetidas" });
    expect(validateItem({ ...RAW, correct: "E" }, EXPECTED)).toEqual({ error: "la clave no es A, B, C o D" });
    expect(validateItem({ ...RAW, distractors: { B: "x", C: "y" } }, EXPECTED)).toEqual({ error: "falta la razón del distractor D" });
  });

  it("rechaza preguntas en español, de otra familia o fuera de banda", () => {
    expect(validateItem({ ...RAW, question: "¿Qué opción completa el texto para que sea correcto?" }, EXPECTED)).toEqual({ error: "el ejercicio debe estar en inglés" });
    expect(validateItem({ ...RAW, family: 3 }, EXPECTED)).toEqual({ error: "no es de la familia pedida" });
    expect(validateItem({ ...RAW, difficulty: 5 }, EXPECTED)).toEqual({ error: "dificultad fuera de la banda" });
  });

  it("evidencia cuantitativa: exige un gráfico con datos coherentes", () => {
    const exp = { family: 10, micro: "F10.1", difficulty: 1 };
    const base = { ...RAW, family: 10, micros: ["F10.1"] };
    expect(validateItem(base, exp)).toEqual({ error: "falta el gráfico" });
    const chart = { kind: "bar", title: "Visitors", categories: ["2021", "2022"], series: [{ name: "Museum", values: [10, 12] }] };
    expect("item" in validateItem({ ...base, chart }, exp)).toBe(true);
    expect(validateItem({ ...base, chart: { ...chart, series: [{ name: "Museum", values: [10] }] } }, exp)).toEqual({ error: "los valores no coinciden con las categorías" });
  });
});

describe("duplicados", () => {
  it("detecta la misma pregunta con otro orden de opciones", () => {
    const a = item();
    const b = item({ ...RAW, options: [{ text: "are" }, { text: "is" }, { text: "have been" }, { text: "were" }], correct: "B", distractors: { A: "x", C: "y", D: "z" } });
    expect(isDuplicate(b.fp, [a.fp])).toBe(true);
  });

  it("detecta una variante que solo cambia nombres o cifras", () => {
    expect(skeleton("Maria visited Lisbon in 1998.")).toBe(skeleton("Elena visited Madrid in 2004."));
    const a = item({ ...RAW, passage: "In 1998, the team led by Maria Lopez published a study that ______ how bees navigate." });
    const b = item({ ...RAW, passage: "In 2004, the team led by Ana Ruiz published a study that ______ how bees navigate." });
    expect(isDuplicate(b.fp, [a.fp])).toBe(true);
  });

  it("no confunde preguntas distintas de la misma habilidad", () => {
    const a = item();
    const b = item({ ...RAW, passage: "Each of the volunteers who joined the coastal cleanup ______ given a pair of gloves and a map of the beach." , options: [{ text: "was" }, { text: "were" }, { text: "are" }, { text: "have been" }] });
    expect(isDuplicate(b.fp, [a.fp])).toBe(false);
  });
});

describe("seguridad de la clave", () => {
  it("lo que va al navegador no lleva la respuesta ni las explicaciones", () => {
    const pub = publicItem(item()) as Record<string, unknown>;
    expect(pub.correct).toBeUndefined();
    expect(pub.explanation).toBeUndefined();
    expect(pub.distractors).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain("Sujeto singular");
  });

  it("detecta una microlección que regala la respuesta", () => {
    const it = { options: [{ id: "A" as const, text: "the data were inconclusive" }, { id: "B" as const, text: "x y" }, { id: "C" as const, text: "z w" }, { id: "D" as const, text: "q r" }], correct: "A" as const };
    expect(leaksAnswer("Recuerda: the data were inconclusive.", it)).toBe(true);
    expect(leaksAnswer("Los datos en plural llevan verbo plural.", it)).toBe(false);
  });
});
