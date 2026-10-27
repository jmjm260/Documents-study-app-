import { describe, expect, it } from "vitest";
import { EXTREME_MINUTES, GRACE_MS, MIN_GLOBAL_MS, QUESTION_MS } from "./config";
import { answer, checkTimeout, initialState, newRound, reveal, roundPassed, startRound, undoFailure, type SatState } from "./engine";
import type { Fingerprint } from "./items";

const fp = (id: string): Fingerprint => ({ passage: id, stem: id, options: id, skeleton: id, minhash: [] });
let counter = 0;

/** Reserva una pregunta nueva para cada posición de la ronda (como hace el servidor). */
function reserveAll(state: SatState) {
  for (const s of state.round.slots) s.itemId ??= `item-${counter++}`;
}

/** Responde bien la pregunta actual (clave "A"), tardando `ms` en contestar. */
function answerRight(state: SatState, now: number, ms = 5_000) {
  const pos = state.round.position;
  reveal(state, state.round.id, pos, now, fp(state.round.slots[pos].itemId!), true);
  return answer(state, { roundId: state.round.id, position: pos, choice: "A", nonce: `n${counter++}` }, "A", now + ms);
}

function passRound(state: SatState, start = 1_000_000) {
  reserveAll(state);
  if (!state.round.started) startRound(state, state.round.id);
  let t = start;
  let last;
  const size = state.round.size;
  // Rápido de sobra para el presupuesto de la ronda (en 60 s totales hay ~1 s por pregunta).
  const ms = Math.min(5_000, Math.floor(state.round.budgetMs / size / 2));
  for (let i = 0; i < size; i++) last = answerRight(state, (t += 10_000), ms);
  return last!;
}

/** Lleva el estado a la banda avanzada (primera ronda de 50 con dificultad ≥ 6). */
function toAdvanced(state: SatState) {
  while (!(state.round.size === 50 && state.round.difficulty >= 6)) passRound(state);
}

describe("aprendizaje", () => {
  it("A1 correcta → B1; B1 correcta → una pregunta NUEVA sobre A", () => {
    const s = initialState(1, "r1");
    reserveAll(s);
    const [a1, b1, a2] = s.round.slots;
    expect(answerRight(s, 1000).status).toBe("correct");
    expect(s.round.position).toBe(1);
    expect(answerRight(s, 2000).status).toBe("correct");
    expect(s.round.slots[2].micro).toBe(a1.micro);
    expect(a2.itemId).not.toBe(a1.itemId);
    expect(b1.kind).toBe("intro");
  });

  it("un error en aprendizaje vuelve al nivel 1 con otra ronda y conserva lo visto", () => {
    const s = initialState(2, "r1");
    passRound(s);
    expect(s.level).toBe(2);
    reserveAll(s);
    const pos = s.round.position;
    const itemId = s.round.slots[pos].itemId!;
    reveal(s, s.round.id, pos, 10, fp(itemId), true);
    const r = answer(s, { roundId: s.round.id, position: pos, choice: "B", nonce: "x" }, "A", 20);
    expect(r.status).toBe("wrong");
    expect(s.level).toBe(1);
    expect(s.round.position).toBe(0);
    expect(s.round.slots.every((x) => x.itemId === null)).toBe(true); // preguntas nuevas
    expect(s.seen.ids).toContain(itemId);
    expect(s.seen.ids.length).toBeGreaterThan(21);
    expect(s.metrics.resets).toBe(1);
    expect(s.failure?.reason).toBe("wrong");
  });
});

describe("tiempo", () => {
  it("60 s por pregunta en rondas de < 50: pasarse cuenta como fallo y reinicia", () => {
    const s = initialState(3, "r1");
    reserveAll(s);
    reveal(s, s.round.id, 0, 0, fp("a"), true);
    expect(checkTimeout(s, QUESTION_MS)).toBe(false);
    expect(checkTimeout(s, QUESTION_MS + GRACE_MS + 1)).toBe(true);
    expect(s.failure?.reason).toBe("timeout");
    expect(s.level).toBe(1);
  });

  it("recargar no renueva el reloj: cuenta desde que se mostró la pregunta", () => {
    const s = initialState(4, "r1");
    reserveAll(s);
    reveal(s, s.round.id, 0, 0, fp("a"), true);
    reveal(s, s.round.id, 0, 50_000, fp("a"), true); // "recarga": idempotente
    expect(s.round.slots[0].presentedAt).toBe(0);
    const r = answer(s, { roundId: s.round.id, position: 0, choice: "A", nonce: "late" }, "A", QUESTION_MS + GRACE_MS + 10);
    expect(r.status).toBe("timeout");
  });

  it("llegar a 50 preguntas fáciles NO activa la reducción de tiempo", () => {
    const s = initialState(5, "r1");
    while (s.round.size < 50) passRound(s);
    expect(s.round.difficulty).toBeLessThan(6);
    expect(s.round.budgetMs).toBe(50 * 60_000);
    const r = passRound(s);
    expect(r.advance).toBe("level");
    expect(s.timeStep).toBeNull();
  });

  it("un 50/50 avanzado activa el siguiente tiempo; la dificultad se mantiene", () => {
    const s = initialState(6, "r1");
    toAdvanced(s);
    const difficulty = s.round.difficulty;
    expect(s.round.requiresFullReserve).toBe(true);
    const r = passRound(s);
    expect(r.advance).toBe("time");
    expect(s.timeStep).toBe(1);
    expect(s.round.budgetMs).toBe(EXTREME_MINUTES[1] * 60_000);
    expect(s.round.difficulty).toBe(difficulty);
    expect(s.round.phase).toBe("velocidad");
  });

  it("el mínimo es 60 s TOTALES y aprobar ahí no baja a cero", () => {
    const s = initialState(7, "r1");
    toAdvanced(s);
    // 50 min (escalón 0) … 5 min: al aprobar cada una baja el tiempo; la siguiente ya es la de 60 s.
    for (let i = 0; i < EXTREME_MINUTES.length - 1; i++) passRound(s);
    expect(s.round.budgetMs).toBe(MIN_GLOBAL_MS);
    const r = passRound(s, 0);
    expect(r.advance).toBe("time-floor");
    expect(s.round.budgetMs).toBe(MIN_GLOBAL_MS);
    expect(s.metrics.perfectAtFloor).toBe(1);
  });

  it("un error en la fase de velocidad también vuelve al nivel 1", () => {
    const s = initialState(8, "r1");
    toAdvanced(s);
    passRound(s);
    reserveAll(s);
    startRound(s, s.round.id);
    reveal(s, s.round.id, 0, 1, fp("z"), true);
    answer(s, { roundId: s.round.id, position: 0, choice: "C", nonce: "bad" }, "A", 2);
    expect(s.level).toBe(1);
    expect(s.timeStep).toBeNull();
    expect(s.round.phase).toBe("aprendizaje");
  });
});

describe("integridad", () => {
  it("un doble envío se procesa una sola vez", () => {
    const s = initialState(9, "r1");
    reserveAll(s);
    reveal(s, s.round.id, 0, 0, fp("a"), true);
    const input = { roundId: s.round.id, position: 0, choice: "A" as const, nonce: "same" };
    const a = answer(s, input, "A", 1000);
    const b = answer(s, input, "A", 1001);
    expect(b).toEqual(a);
    expect(s.round.position).toBe(1);
    expect(s.metrics.answered).toBe(1);
  });

  it("una ronda sin las 11 familias no se puede aprobar", () => {
    const round = newRound(1, null, {}, 1, "r");
    round.slots.forEach((x, i) => Object.assign(x, { itemId: `i${i}`, state: "correct", activeMs: 1000, fresh: true, family: 1 }));
    expect(roundPassed(round).ok).toBe(false);
  });

  it("una ronda con preguntas repetidas (no nuevas) no se puede aprobar", () => {
    const round = newRound(1, null, {}, 1, "r");
    round.slots.forEach((x, i) => Object.assign(x, { itemId: `i${i}`, state: "correct", activeMs: 1000, fresh: i !== 3 }));
    expect(roundPassed(round).ok).toBe(false);
  });

  it("las rondas cronometradas sin lecciones no empiezan con preguntas pendientes", () => {
    const s = initialState(10, "r1");
    toAdvanced(s);
    expect(s.round.started).toBe(false);
    s.round.slots[0].itemId = "solo-una";
    expect(() => startRound(s, s.round.id)).toThrow();
  });

  it("si la pregunta era defectuosa, se deshace el reinicio sin castigo", () => {
    const s = initialState(11, "r1");
    passRound(s);
    reserveAll(s);
    reveal(s, s.round.id, 0, 0, fp("bad"), true);
    answer(s, { roundId: s.round.id, position: 0, choice: "B", nonce: "q" }, "A", 1);
    expect(s.level).toBe(1);
    expect(undoFailure(s, 2)).toBe(true);
    expect(s.level).toBe(2);
    expect(s.round.slots[0].itemId).toBeNull(); // se repone con una pregunta nueva
    expect(s.metrics.resets).toBe(0);
    expect(s.seen.ids).toContain(s.seen.ids[s.seen.ids.length - 1]); // lo visto sigue visto
  });
});
