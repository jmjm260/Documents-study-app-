import { describe, expect, it } from "vitest";
import { initialState } from "./engine";
import type { Fingerprint } from "./items";
import { mergeStates } from "./merge";

const fp = (id: string): Fingerprint => ({ passage: id, stem: id, options: id, skeleton: id, minhash: [] });

describe("mergeStates", () => {
  it("une las preguntas vistas, suma intentos y se queda el progreso más avanzado", () => {
    const pc = initialState(1, "a");
    pc.level = 3;
    pc.seen = { ids: ["i1", "i2"], fps: [fp("i1"), fp("i2")] };
    pc.metrics.answered = 50;
    pc.metrics.best.level = 3;
    pc.stats["F1.1"] = { attempts: 5, correct: 5 };

    const phone = initialState(2, "b");
    phone.level = 1;
    phone.seen = { ids: ["i2", "i3"], fps: [fp("i2"), fp("i3")] };
    phone.metrics.answered = 7;
    phone.metrics.resets = 2;
    phone.stats["F1.1"] = { attempts: 2, correct: 1 };

    const m = mergeStates(pc, phone);
    expect(m.seen.ids.sort()).toEqual(["i1", "i2", "i3"]);
    expect(m.seen.fps).toHaveLength(3);
    expect(m.level).toBe(3); // el más avanzado
    expect(m.round.id).toBe("a");
    expect(m.metrics.answered).toBe(57);
    expect(m.metrics.resets).toBe(2);
    expect(m.metrics.best.level).toBe(3);
    expect(m.stats["F1.1"]).toEqual({ attempts: 7, correct: 6 });
  });

  it("la fase de velocidad cuenta como más avanzada que cualquier nivel", () => {
    const a = initialState(1, "a");
    a.level = 9;
    const b = initialState(2, "b");
    b.level = 9;
    b.timeStep = 2;
    expect(mergeStates(a, b).timeStep).toBe(2);
  });
});
