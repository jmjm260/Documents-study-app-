import { describe, expect, it } from "vitest";
import { EXTREME_MINUTES, GRACE_MS, MIN_GLOBAL_MS, QUESTION_MS } from "./config";
import { acceptRestore, answer, applyDefect, checkTimeout, curriculumAudit, initialState, microStatus, newRound, reveal, roundPassed, startRound, type SatState } from "./engine";
import { MICROS } from "./curriculum";
import type { Fingerprint } from "./items";

const fp = (id: string): Fingerprint => ({ passage: id, stem: id, options: id, skeleton: id, minhash: [] });
let counter = 0;

/**
 * Reserva una pregunta nueva para cada posición de la ronda (como hace el servidor). `band` simula lo que
 * dijo la revisión ciega de dificultad: en la banda avanzada hace falta "hard" o "por encima".
 */
function reserveAll(state: SatState, band = "hard") {
  for (const s of state.round.slots) {
    s.itemId ??= `item-${counter++}`;
    s.band ??= band;
  }
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

});

describe("defectos confirmados (el reporte por sí solo no cambia nada: eso lo prueba el servicio)", () => {
  it("pregunta abierta defectuosa: se sustituye en la MISMA posición y hay que responderla", () => {
    const s = initialState(11, "r1");
    reserveAll(s);
    answerRight(s, 0);
    reveal(s, s.round.id, 1, 100, fp("bad"), true);
    const bad = s.round.slots[1].itemId!;
    applyDefect(s, bad, 200);
    expect(s.round.position).toBe(1); // no avanza
    expect(s.round.slots[1].itemId).toBeNull(); // otra pregunta nueva
    expect(s.metrics.correct).toBe(1); // no concede acierto
    expect(s.seen.ids).toContain(bad); // sigue contando como vista
  });

  it("acierto en una pregunta defectuosa: se anula y esa posición se vuelve a pedir al final", () => {
    const s = initialState(12, "r1");
    reserveAll(s);
    answerRight(s, 0);
    const first = s.round.slots[0].itemId!;
    applyDefect(s, first, 50);
    expect(s.metrics.correct).toBe(0);
    reserveAll(s);
    for (let i = 1; i < s.round.size; i++) answerRight(s, 1000 * i);
    // La ronda no se completa sin volver a la posición 0.
    expect(s.round.position).toBe(0);
    expect(s.level).toBe(1);
    const r = answerRight(s, 99_000);
    expect(r.roundComplete).toBe(true);
    expect(s.level).toBe(2);
  });

  it("si causó el reinicio y aún no empezaste nada: se anula y vuelves a tu ronda", () => {
    const s = initialState(13, "r1");
    passRound(s);
    reserveAll(s);
    answerRight(s, 0);
    reveal(s, s.round.id, 1, 10, fp("bad"), true);
    const bad = s.round.slots[1].itemId!;
    answer(s, { roundId: s.round.id, position: 1, choice: "B", nonce: "q" }, "A", 20);
    expect(s.level).toBe(1);
    applyDefect(s, bad, 30);
    expect(s.level).toBe(2);
    expect(s.round.position).toBe(1);
    expect(s.round.slots[1].itemId).toBeNull();
    expect(s.metrics.resets).toBe(0);
    expect(s.metrics.answered).toBe(22); // 21 de la ronda 1 + el acierto; el fallo inválido no cuenta
  });

  it("si ya seguiste después: no se borra lo nuevo; se OFRECE recuperar la ronda", () => {
    const s = initialState(14, "r1");
    passRound(s);
    reserveAll(s);
    reveal(s, s.round.id, 0, 10, fp("bad"), true);
    const bad = s.round.slots[0].itemId!;
    answer(s, { roundId: s.round.id, position: 0, choice: "B", nonce: "q" }, "A", 20);
    reserveAll(s);
    answerRight(s, 100); // ya avanzó en la ronda nueva
    const answeredAfter = s.metrics.answered;
    applyDefect(s, bad, 200);
    expect(s.level).toBe(1); // no se pisó lo hecho
    expect(s.round.position).toBe(1);
    expect(s.restoreOffer).not.toBeNull();
    expect(s.metrics.answered).toBe(answeredAfter - 1); // solo se quitó el intento inválido
    acceptRestore(s, 300);
    expect(s.level).toBe(2);
  });
});

describe("currículo", () => {
  it("el inventario real es el del catálogo (no un número supuesto)", () => {
    const audit = curriculumAudit(initialState(1, "r"));
    expect(audit).toHaveLength(MICROS.length);
    expect(new Set(audit.map((a) => a.id)).size).toBe(MICROS.length);
    expect(MICROS.length).toBe(67);
  });

  it("el repaso aplazado por falta de sitio aparece en la ronda siguiente y no se pierde", () => {
    const s = initialState(15, "r1");
    // Nivel 1: 11 conceptos en 21 preguntas; el último (F11.1) no cabe con su repaso.
    expect(s.round.slots.some((x) => x.micro === "F11.1" && x.kind === "review")).toBe(false);
    passRound(s);
    expect(s.pendingReviews).toContain("F11.1");
    expect(s.round.slots.some((x) => x.micro === "F11.1" && x.kind === "review")).toBe(true);
    passRound(s);
    expect(s.pendingReviews).not.toContain("F11.1"); // al acertarlo, deja de estar pendiente
  });

  it("solo quedan pendientes los conceptos que de verdad se presentaron", () => {
    const s = initialState(17, "r1");
    reserveAll(s);
    answerRight(s, 0); // A1 (F1.1)
    reveal(s, s.round.id, 1, 10, fp("x"), true);
    answer(s, { roundId: s.round.id, position: 1, choice: "B", nonce: "w" }, "A", 20); // falla B1 (F2.1)
    expect(s.pendingReviews.sort()).toEqual(["F1.1", "F2.1"]);
  });

  it("lección vista ≠ respondida ≠ demostrada", () => {
    expect(microStatus(undefined)).toBe("sin empezar");
    expect(microStatus({ lessonShownAt: 1, answered: 0, correct: 0, roundsCorrect: [] })).toBe("lección vista");
    expect(microStatus({ lessonShownAt: 1, answered: 2, correct: 2, roundsCorrect: ["r1"] })).toBe("respondida");
    expect(microStatus({ lessonShownAt: 1, answered: 3, correct: 3, roundsCorrect: ["r1", "r2"] })).toBe("demostrada");
  });
});

describe("puerta de velocidad", () => {
  it("50/50 en dificultad avanzada SIN banda confirmada por la revisión no abre la velocidad", () => {
    const s = initialState(16, "r1");
    toAdvanced(s);
    for (const x of s.round.slots) x.band = "medium";
    const r = passRound(s);
    expect(r.advance).toBe("level");
    expect(s.timeStep).toBeNull();
    expect(s.events.some((e) => e.type === "speed-gate-blocked")).toBe(true);
  });
});
