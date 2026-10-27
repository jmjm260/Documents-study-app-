import { describe, expect, it } from "vitest";
import { levelInfo, MAX_ROUND } from "./config";
import { FAMILIES, MICROS } from "./curriculum";
import { allMicrosTaughtBy, familiesIn, introSchedule, introsForLevel, planRound } from "./planner";

describe("introSchedule", () => {
  it("el nivel 1 presenta las 11 familias y al final se enseñan todos los microobjetivos, sin repetir", () => {
    const s = introSchedule();
    expect(new Set(s[0].map((id) => id.split(".")[0])).size).toBe(11);
    const all = s.flat();
    expect(all).toHaveLength(MICROS.length);
    expect(new Set(all).size).toBe(MICROS.length);
  });

  it("todo se enseña antes de la banda avanzada (rondas de 50 con dificultad ≥ 6)", () => {
    const firstAdvanced = Array.from({ length: 12 }, (_, i) => i + 1).find((l) => levelInfo(l).difficulty >= 6)!;
    expect(allMicrosTaughtBy(firstAdvanced - 1)).toBe(true);
  });

  it("los prerrequisitos se enseñan antes", () => {
    const order = introSchedule().flat();
    for (const m of MICROS) for (const p of m.prereq) expect(order.indexOf(p)).toBeLessThan(order.indexOf(m.id));
  });
});

describe("planRound", () => {
  it("empieza A1 → B1 → A2: explica A, explica B, y vuelve a A con otra pregunta", () => {
    const [a1, b1, a2] = planRound({ level: 1, size: 21, stats: {}, seed: 1 });
    expect(a1.kind).toBe("intro");
    expect(b1.kind).toBe("intro");
    expect(a2).toEqual({ kind: "review", micro: a1.micro, family: a1.family });
    expect(b1.micro).not.toBe(a1.micro);
  });

  it("nivel 1: 21 preguntas, las 11 familias, cada concepto nuevo se explica antes de evaluarse", () => {
    const slots = planRound({ level: 1, size: 21, stats: {}, seed: 7 });
    expect(slots).toHaveLength(21);
    expect(familiesIn(slots).size).toBe(11);
    const introduced = new Set<string>();
    for (const s of slots) {
      if (s.kind === "intro") introduced.add(s.micro);
      else expect(introduced.has(s.micro)).toBe(true);
    }
  });

  it("todos los niveles cubren las 11 familias y nunca pasan de 50", () => {
    for (let level = 1; level <= 12; level++) {
      const { size } = levelInfo(level);
      const slots = planRound({ level, size, stats: {}, seed: level });
      expect(slots.length).toBeLessThanOrEqual(MAX_ROUND);
      expect(slots.length).toBeGreaterThanOrEqual(11);
      expect(familiesIn(slots).size).toBe(FAMILIES.length);
      for (const id of introsForLevel(level)) expect(slots.some((s) => s.micro === id && s.kind === "intro")).toBe(true);
    }
  });

  it("rondas sin conceptos nuevos: 50 de evaluación con reparto tipo SAT", () => {
    const slots = planRound({ level: 9, size: 50, stats: {}, seed: 3 });
    expect(slots).toHaveLength(50);
    expect(slots.every((s) => s.kind === "review")).toBe(true);
    const area = (ids: number[]) => slots.filter((s) => ids.includes(s.family)).length;
    expect(area([1, 2])).toBe(13);
    expect(area([3, 4])).toBe(10);
    expect(area([5, 6, 7])).toBe(14);
    expect(area([8, 9, 10, 11])).toBe(13);
  });

  it("refuerza lo que más costó", () => {
    const weak = { "F1.1": { attempts: 10, correct: 2 } };
    const strong = { "F1.1": { attempts: 10, correct: 10 } };
    const count = (stats: Record<string, { attempts: number; correct: number }>) =>
      Array.from({ length: 20 }, (_, i) => planRound({ level: 9, size: 50, stats, seed: i + 1 }))
        .flat()
        .filter((s) => s.micro === "F1.1").length;
    expect(count(weak)).toBeGreaterThan(count(strong));
  });
});
