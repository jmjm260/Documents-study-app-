// Motor del entrenamiento SAT de Tocorito (lógica pura, sin IA ni archivos; el servidor la usa).
//
// Reglas de producto (no de College Board):
// - Un solo error confirmado (o agotar el tiempo) → vuelta al inicio del nivel 1, con preguntas NUEVAS.
//   Se conservan el historial de vistas, las métricas y lo que costó. Un fallo técnico no es un error.
// - Tiempo: en rondas de < 50, 60 s por pregunta (solo responder). En rondas de 50, un presupuesto GLOBAL
//   que solo corre mientras se responde (no al leer lecciones ni feedback). El reloj usa marcas de tiempo
//   del servidor: recargar o cambiar de pestaña no lo renueva.
// - La reducción de tiempo solo empieza tras un 50/50 en la banda avanzada, con todo enseñado y cubierto,
//   y nunca baja de 60 s TOTALES. Un error ahí también vuelve al nivel 1.
import { FAMILIES } from "./curriculum";
import {
  ADVANCED_MIN_DIFFICULTY,
  EXTREME_MINUTES,
  globalBudgetMs,
  GRACE_MS,
  levelInfo,
  MAX_ROUND,
  QUESTION_MS,
} from "./config";
import type { Fingerprint, OptionId } from "./items";
import { allMicrosTaughtBy, familiesIn, introsForLevel, planRound, type MicroStats, type SlotKind } from "./planner";

export type Phase = "aprendizaje" | "dificultad" | "velocidad";

export type SatSlot = {
  kind: SlotKind;
  micro: string;
  family: number;
  /** Pregunta reservada para esta posición (null = aún preparándose). */
  itemId: string | null;
  state: "pending" | "revealed" | "correct";
  presentedAt?: number;
  answeredAt?: number;
  /** Tiempo respondiendo (desde que se mostró la pregunta hasta confirmar). */
  activeMs?: number;
  /** La pregunta era nueva para el usuario al mostrarse. */
  fresh?: boolean;
};

export type SatRound = {
  id: string;
  level: number;
  size: number;
  difficulty: number;
  phase: Phase;
  timeMode: "question" | "global";
  /** Presupuesto total de respuesta (ms). */
  budgetMs: number;
  /** Escalón de tiempo de la fase de velocidad (null fuera de ella). */
  timeStep: number | null;
  /** Hay que tener las N preguntas reservadas antes de empezar (rondas cronometradas sin lecciones). */
  requiresFullReserve: boolean;
  started: boolean;
  position: number;
  slots: SatSlot[];
};

export type Failure = {
  reason: "wrong" | "timeout";
  itemId: string | null;
  choice: OptionId | null;
  at: number;
  level: number;
  position: number;
  acknowledged: boolean;
  /** Cómo estaba todo antes del reinicio (por si la pregunta resulta defectuosa y hay que deshacerlo). */
  snapshot: { level: number; timeStep: number | null; round: SatRound };
};

export type AnswerResult = {
  status: "correct" | "wrong" | "timeout";
  correct: OptionId | null;
  roundComplete: boolean;
  /** Qué pasó al completar la ronda: subir de nivel, bajar el tiempo, o mantener 60 s. */
  advance?: "level" | "time" | "time-floor";
};

export type SatState = {
  version: 1;
  level: number;
  /** Escalón de tiempo desbloqueado (null = aún no empezó la reducción). */
  timeStep: number | null;
  round: SatRound;
  /** Historial PERMANENTE de lo mostrado (nunca se borra, tampoco al reiniciar). */
  seen: { ids: string[]; fps: Fingerprint[] };
  stats: MicroStats;
  familyStats: Record<number, { attempts: number; correct: number; totalMs: number }>;
  metrics: {
    resets: number;
    roundsPassed: number;
    answered: number;
    correct: number;
    timeouts: number;
    wrongByFamily: Record<number, number>;
    best: { level: number; timeStep: number | null; roundSize: number };
    perfectAtFloor: number;
  };
  failure: Failure | null;
  /** Respuestas ya procesadas por su "nonce" (un doble envío devuelve lo mismo). */
  processed: Record<string, AnswerResult>;
  events: { t: number; type: string; detail?: string }[];
  seed: number;
};

export class SatError extends Error {
  constructor(public code: "round" | "position" | "not_ready" | "not_revealed" | "not_started", message: string) {
    super(message);
  }
}

export function phaseFor(level: number, timeStep: number | null): Phase {
  if (timeStep !== null) return "velocidad";
  return introsForLevel(level).length ? "aprendizaje" : "dificultad";
}

export function newRound(level: number, timeStep: number | null, stats: MicroStats, seed: number, id: string): SatRound {
  const { size, difficulty } = levelInfo(level);
  const planned = planRound({ level, size, stats, seed });
  const phase = phaseFor(level, timeStep);
  const global = planned.length >= MAX_ROUND;
  const hasIntros = planned.some((s) => s.kind === "intro");
  return {
    id,
    level,
    size: planned.length,
    difficulty,
    phase,
    timeMode: global ? "global" : "question",
    budgetMs: global ? globalBudgetMs(timeStep ?? 0) : planned.length * QUESTION_MS,
    timeStep,
    requiresFullReserve: global && !hasIntros,
    started: !(global && !hasIntros),
    position: 0,
    slots: planned.map((s) => ({ ...s, itemId: null, state: "pending" })),
  };
}

export function initialState(seed: number, roundId: string): SatState {
  return {
    version: 1,
    level: 1,
    timeStep: null,
    round: newRound(1, null, {}, seed, roundId),
    seen: { ids: [], fps: [] },
    stats: {},
    familyStats: {},
    metrics: { resets: 0, roundsPassed: 0, answered: 0, correct: 0, timeouts: 0, wrongByFamily: {}, best: { level: 1, timeStep: null, roundSize: 0 }, perfectAtFloor: 0 },
    failure: null,
    processed: {},
    events: [],
    seed,
  };
}

function log(state: SatState, now: number, type: string, detail?: string) {
  state.events.push({ t: now, type, ...(detail ? { detail } : {}) });
  if (state.events.length > 300) state.events.splice(0, state.events.length - 300);
}

/** Tiempo de respuesta gastado en la ronda (incluye la pregunta abierta ahora). */
export function usedMs(round: SatRound, now: number): number {
  return round.slots.reduce((sum, s) => {
    if (s.state === "correct") return sum + (s.activeMs ?? 0);
    if (s.state === "revealed" && s.presentedAt != null) return sum + Math.max(0, now - s.presentedAt);
    return sum;
  }, 0);
}

/** Tiempo que le queda a la pregunta abierta (modo por pregunta) o a la ronda (modo global). */
export function remainingMs(round: SatRound, now: number): number {
  if (round.timeMode === "global") return round.budgetMs - usedMs(round, now);
  const s = round.slots[round.position];
  if (s?.state !== "revealed" || s.presentedAt == null) return QUESTION_MS;
  return QUESTION_MS - (now - s.presentedAt);
}

function overdue(round: SatRound, now: number): boolean {
  return remainingMs(round, now) < -GRACE_MS;
}

/** Empieza una ronda que necesitaba tener todo reservado (el servidor comprueba que lo está). */
export function startRound(state: SatState, roundId: string) {
  if (state.round.id !== roundId) throw new SatError("round", "Esa ronda ya no está activa.");
  if (state.round.slots.some((s) => !s.itemId)) throw new SatError("not_ready", "La ronda aún se está preparando.");
  state.round.started = true;
}

/**
 * Muestra la pregunta de la posición actual (al pulsar "Empezar pregunta", o al entrar en un repaso).
 * Idempotente. Desde aquí corre su tiempo y la pregunta cuenta como VISTA (aunque no se responda).
 */
export function reveal(state: SatState, roundId: string, position: number, now: number, fp: Fingerprint | null, fresh: boolean) {
  const round = state.round;
  if (round.id !== roundId) throw new SatError("round", "Esa ronda ya no está activa.");
  if (!round.started) throw new SatError("not_started", "La ronda aún no empezó.");
  if (position !== round.position) throw new SatError("position", "Esa no es la pregunta actual.");
  const slot = round.slots[position];
  if (!slot.itemId) throw new SatError("not_ready", "La pregunta aún se está preparando.");
  if (slot.state !== "pending") return;
  slot.state = "revealed";
  slot.presentedAt = now;
  slot.fresh = fresh;
  if (!state.seen.ids.includes(slot.itemId)) {
    state.seen.ids.push(slot.itemId);
    if (fp) state.seen.fps.push(fp);
  }
}

/** Respuesta confirmada. Se evalúa UNA vez contra la clave validada (`correct`). */
export function answer(
  state: SatState,
  input: { roundId: string; position: number; choice: OptionId; nonce: string },
  correct: OptionId,
  now: number
): AnswerResult {
  const done = state.processed[input.nonce];
  if (done) return done;

  const round = state.round;
  if (round.id !== input.roundId) throw new SatError("round", "Esa ronda ya no está activa.");
  const slot = round.slots[input.position];
  if (!slot || input.position !== round.position) throw new SatError("position", "Esa no es la pregunta actual.");
  if (slot.state !== "revealed" || slot.presentedAt == null) throw new SatError("not_revealed", "La pregunta aún no se mostró.");

  let result: AnswerResult;
  if (overdue(round, now)) {
    result = { status: "timeout", correct, roundComplete: false };
    fail(state, "timeout", now, slot.itemId, null);
  } else if (input.choice !== correct) {
    result = { status: "wrong", correct, roundComplete: false };
    record(state, slot, now - slot.presentedAt, false);
    fail(state, "wrong", now, slot.itemId, input.choice);
  } else {
    slot.state = "correct";
    slot.answeredAt = now;
    slot.activeMs = now - slot.presentedAt;
    record(state, slot, slot.activeMs, true);
    round.position++;
    result = { status: "correct", correct, roundComplete: false };
    if (round.position >= round.size) {
      result.roundComplete = true;
      result.advance = completeRound(state, now);
    }
  }
  state.processed[input.nonce] = result;
  const keys = Object.keys(state.processed);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete state.processed[k];
  return result;
}

function record(state: SatState, slot: SatSlot, ms: number, ok: boolean) {
  for (const micro of [slot.micro]) {
    const s = (state.stats[micro] ??= { attempts: 0, correct: 0 });
    s.attempts++;
    if (ok) s.correct++;
  }
  const f = (state.familyStats[slot.family] ??= { attempts: 0, correct: 0, totalMs: 0 });
  f.attempts++;
  f.totalMs += Math.max(0, ms);
  if (ok) f.correct++;
  state.metrics.answered++;
  if (ok) state.metrics.correct++;
  else state.metrics.wrongByFamily[slot.family] = (state.metrics.wrongByFamily[slot.family] ?? 0) + 1;
}

/** Si la pregunta abierta (o la ronda global) se pasó de tiempo, cuenta como fallo. Se llama al consultar el estado. */
export function checkTimeout(state: SatState, now: number): boolean {
  const round = state.round;
  const slot = round.slots[round.position];
  if (!round.started || slot?.state !== "revealed" || !overdue(round, now)) return false;
  fail(state, "timeout", now, slot.itemId, null);
  return true;
}

let roundCounter = 0;
const nextRoundId = (now: number) => `r${now.toString(36)}${(roundCounter++).toString(36)}`;

/** Un error (o agotar el tiempo): todo el desafío vuelve al nivel 1. Lo aprendido y lo visto se conserva. */
function fail(state: SatState, reason: "wrong" | "timeout", now: number, itemId: string | null, choice: OptionId | null) {
  const round = state.round;
  state.failure = {
    reason,
    itemId,
    choice,
    at: now,
    level: state.level,
    position: round.position,
    acknowledged: false,
    snapshot: { level: state.level, timeStep: state.timeStep, round: structuredClone(round) },
  };
  state.metrics.resets++;
  if (reason === "timeout") state.metrics.timeouts++;
  log(state, now, "reset", `${reason} en nivel ${state.level}, pregunta ${round.position + 1}/${round.size}`);
  state.level = 1;
  state.timeStep = null;
  state.seed = (state.seed * 31 + 7) >>> 0;
  state.round = newRound(1, null, state.stats, state.seed, nextRoundId(now));
}

/**
 * Condición de victoria, comprobada explícitamente: cantidad completa, cero errores (todas correctas),
 * las 11 familias, tiempo válido, preguntas nuevas, y (para la velocidad) los prerrequisitos de la fase.
 */
export function roundPassed(round: SatRound): { ok: boolean; advanced: boolean } {
  const allCorrect = round.slots.length === round.size && round.slots.every((s) => s.state === "correct" && s.itemId);
  const coverage = familiesIn(round.slots).size === FAMILIES.length;
  const timeOk = round.timeMode === "global" ? round.slots.reduce((a, s) => a + (s.activeMs ?? 0), 0) <= round.budgetMs + GRACE_MS : round.slots.every((s) => (s.activeMs ?? 0) <= QUESTION_MS + GRACE_MS);
  const allFresh = round.slots.every((s) => s.fresh);
  const ok = allCorrect && coverage && timeOk && allFresh;
  const advanced = ok && round.size === MAX_ROUND && round.difficulty >= ADVANCED_MIN_DIFFICULTY && allMicrosTaughtBy(round.level);
  return { ok, advanced };
}

function completeRound(state: SatState, now: number): AnswerResult["advance"] {
  const round = state.round;
  const { ok, advanced } = roundPassed(round);
  if (!ok) {
    // No debería pasar (se controla pregunta a pregunta). Sin castigo: se repite el nivel con otra ronda.
    log(state, now, "round-invalid", `nivel ${round.level}`);
    state.seed = (state.seed * 31 + 11) >>> 0;
    state.round = newRound(state.level, state.timeStep, state.stats, state.seed, nextRoundId(now));
    return undefined;
  }
  state.metrics.roundsPassed++;
  let advance: AnswerResult["advance"];
  if (advanced) {
    // Fase de velocidad: misma dificultad, preguntas nuevas, menos tiempo (sin bajar de 60 s en total).
    const last = EXTREME_MINUTES.length - 1;
    if (state.timeStep === last) {
      state.metrics.perfectAtFloor++;
      advance = "time-floor";
    } else {
      state.timeStep = state.timeStep === null ? 1 : state.timeStep + 1;
      advance = "time";
    }
  } else {
    state.level++;
    advance = "level";
  }
  const best = state.metrics.best;
  if (state.level > best.level) best.level = state.level;
  if (state.timeStep !== null && (best.timeStep === null || state.timeStep > best.timeStep)) best.timeStep = state.timeStep;
  best.roundSize = Math.max(best.roundSize, round.size);
  log(state, now, "round-passed", `nivel ${round.level}${round.timeStep !== null ? `, tiempo ${round.budgetMs / 1000}s` : ""}`);
  state.seed = (state.seed * 31 + 13) >>> 0;
  state.round = newRound(state.level, state.timeStep, state.stats, state.seed, nextRoundId(now));
  return advance;
}

export function acknowledgeFailure(state: SatState) {
  if (state.failure) state.failure.acknowledged = true;
}

/**
 * La pregunta que provocó el reinicio era defectuosa (lo confirmó la revisión): se deshace el reinicio.
 * Vuelve la ronda tal como estaba, con esa posición pendiente de una pregunta NUEVA y sin castigo.
 */
export function undoFailure(state: SatState, now: number): boolean {
  const f = state.failure;
  if (!f) return false;
  const round = structuredClone(f.snapshot.round);
  const slot = round.slots[f.position];
  if (slot) {
    // La respuesta a una pregunta defectuosa tampoco cuenta en las estadísticas.
    if (f.reason === "wrong") {
      const s = state.stats[slot.micro];
      if (s) s.attempts = Math.max(0, s.attempts - 1);
      const fam = state.familyStats[slot.family];
      if (fam) fam.attempts = Math.max(0, fam.attempts - 1);
      state.metrics.answered = Math.max(0, state.metrics.answered - 1);
      state.metrics.wrongByFamily[slot.family] = Math.max(0, (state.metrics.wrongByFamily[slot.family] ?? 1) - 1);
    }
    Object.assign(slot, { itemId: null, state: "pending", presentedAt: undefined, answeredAt: undefined, activeMs: undefined, fresh: undefined });
  }
  state.level = f.snapshot.level;
  state.timeStep = f.snapshot.timeStep;
  state.round = round;
  state.metrics.resets = Math.max(0, state.metrics.resets - 1);
  if (f.reason === "timeout") state.metrics.timeouts = Math.max(0, state.metrics.timeouts - 1);
  state.failure = null;
  log(state, now, "reset-undone", "pregunta defectuosa");
  return true;
}
