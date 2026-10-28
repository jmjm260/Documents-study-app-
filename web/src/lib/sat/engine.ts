// Motor del entrenamiento SAT de Tocorito (lógica pura, sin IA ni archivos; el servidor la usa).
//
// Reglas de producto (no de College Board):
// - Un solo error académico confirmado (o agotar el tiempo) → vuelta al inicio del nivel 1, con preguntas NUEVAS.
//   Se conservan el historial de vistas, las métricas y lo que costó. Un fallo técnico no es un error.
// - Tiempo: en rondas de < 50, 60 s por pregunta (solo responder). En rondas de 50, un presupuesto GLOBAL
//   que solo corre mientras hay una pregunta abierta (no al leer lecciones ni feedback). El reloj usa marcas de
//   tiempo del servidor: recargar o cambiar de pestaña no lo renueva.
// - La reducción de tiempo solo empieza tras un 50/50 en la banda avanzada CONFIRMADA por la revisión ciega
//   (cada pregunta de la ronda), con todo enseñado y cubierto, y nunca baja de 60 s TOTALES.
// - Reportar NO pausa ni cambia nada por sí solo. Solo un defecto CONFIRMADO anula sus consecuencias
//   (ver applyDefect), sin borrar intentos posteriores.
import { FAMILIES, MICROS } from "./curriculum";
import { ADVANCED_MIN_DIFFICULTY, EXTREME_MINUTES, globalBudgetMs, GRACE_MS, levelInfo, MAX_ROUND, QUESTION_MS } from "./config";
import type { Fingerprint, OptionId } from "./items";
import { allMicrosTaughtBy, familiesIn, introsForLevel, planRound, taughtBefore, type MicroStats, type SlotKind } from "./planner";

export type Phase = "aprendizaje" | "dificultad" | "velocidad";

export type SatSlot = {
  kind: SlotKind;
  micro: string;
  family: number;
  /** Pregunta reservada para esta posición (null = aún preparándose). */
  itemId: string | null;
  /** Banda estimada por la revisión ciega de la pregunta reservada (para la puerta de velocidad). */
  band?: string;
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
  id: string;
  reason: "wrong" | "timeout";
  itemId: string | null;
  choice: OptionId | null;
  micro: string;
  family: number;
  at: number;
  level: number;
  position: number;
  acknowledged: boolean;
  /** true si una revisión confirmó que la pregunta era defectuosa (el reinicio se anuló). */
  voided?: boolean;
  /** Cómo estaba todo antes del reinicio (para ofrecer recuperarlo si la pregunta era defectuosa). */
  snapshot: { level: number; timeStep: number | null; round: SatRound };
};

export type AnswerResult = {
  status: "correct" | "wrong" | "timeout";
  correct: OptionId | null;
  roundComplete: boolean;
  /** Qué pasó al completar la ronda: subir de nivel, bajar el tiempo, o mantener 60 s. */
  advance?: "level" | "time" | "time-floor";
};

/** Seguimiento por microobjetivo: lección mostrada ≠ pregunta respondida ≠ desempeño demostrado. */
export type MicroProgress = { lessonShownAt?: number; lessonVersion?: number; answered: number; correct: number; roundsCorrect: string[] };

export type SatState = {
  version: 2;
  level: number;
  /** Escalón de tiempo desbloqueado (null = aún no empezó la reducción). */
  timeStep: number | null;
  round: SatRound;
  /** Historial PERMANENTE de lo mostrado (nunca se borra: ni al reiniciar ni en mantenimiento). */
  seen: { ids: string[]; fps: Fingerprint[] };
  stats: MicroStats;
  familyStats: Record<number, { attempts: number; correct: number; totalMs: number }>;
  micro: Record<string, MicroProgress>;
  /** Repasos aplazados por falta de sitio: se incluyen en las rondas siguientes hasta acertarlos. */
  pendingReviews: string[];
  metrics: {
    resets: number;
    roundsPassed: number;
    answered: number;
    correct: number;
    timeouts: number;
    wrongByFamily: Record<number, number>;
    best: { level: number; timeStep: number | null; roundSize: number };
    perfectAtFloor: number;
    defectsConfirmed: number;
  };
  failure: Failure | null;
  /** Si una pregunta defectuosa causó un reinicio y luego seguiste, puedes recuperar aquella ronda (o no). */
  restoreOffer: { failureId: string; level: number; timeStep: number | null; round: SatRound; at: number } | null;
  /** Reportes: lo que pidió el estudiante y lo que decidió la revisión (separados). */
  reports: Record<string, { at: number; contest: boolean; status: "pending" | "defective" | "valid" | "error"; detail?: string }>;
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

export function newRound(level: number, timeStep: number | null, stats: MicroStats, seed: number, id: string, mustReview: string[] = []): SatRound {
  const { size, difficulty } = levelInfo(level);
  const planned = planRound({ level, size, stats, seed, mustReview });
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
    version: 2,
    level: 1,
    timeStep: null,
    round: newRound(1, null, {}, seed, roundId),
    seen: { ids: [], fps: [] },
    stats: {},
    familyStats: {},
    micro: {},
    pendingReviews: [],
    metrics: { resets: 0, roundsPassed: 0, answered: 0, correct: 0, timeouts: 0, wrongByFamily: {}, best: { level: 1, timeStep: null, roundSize: 0 }, perfectAtFloor: 0, defectsConfirmed: 0 },
    failure: null,
    restoreOffer: null,
    reports: {},
    processed: {},
    events: [],
    seed,
  };
}

/** Estados guardados por la versión anterior: se completan sin perder nada. */
export function migrateState(s: SatState | (Omit<SatState, "version"> & { version: 1 })): SatState {
  const st = s as SatState;
  st.version = 2;
  st.micro ??= {};
  st.pendingReviews ??= [];
  st.restoreOffer ??= null;
  st.reports ??= {};
  st.metrics.defectsConfirmed ??= 0;
  if (st.failure) {
    st.failure.id ??= `f${st.failure.at.toString(36)}`;
    const slot = st.failure.snapshot.round.slots[st.failure.position];
    st.failure.micro ??= slot?.micro ?? "";
    st.failure.family ??= slot?.family ?? 0;
  }
  return st;
}

function log(state: SatState, now: number, type: string, detail?: string) {
  state.events.push({ t: now, type, ...(detail ? { detail } : {}) });
  if (state.events.length > 500) state.events.splice(0, state.events.length - 500);
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

/** Siguiente posición sin acertar (las anuladas por un defecto se vuelven a pedir al final). -1 = completa. */
function nextOpen(round: SatRound, from: number): number {
  for (let i = from; i < round.slots.length; i++) if (round.slots[i].state !== "correct") return i;
  for (let i = 0; i < from; i++) if (round.slots[i].state !== "correct") return i;
  return -1;
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
export function reveal(state: SatState, roundId: string, position: number, now: number, fp: Fingerprint | null, fresh: boolean, lessonVersion?: number) {
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
  // En un concepto nuevo, la lección se mostró antes de esta pregunta.
  if (slot.kind === "intro") {
    const mp = (state.micro[slot.micro] ??= { answered: 0, correct: 0, roundsCorrect: [] });
    mp.lessonShownAt ??= now;
    if (lessonVersion !== undefined) mp.lessonVersion = lessonVersion;
  }
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
    fail(state, "timeout", now);
  } else if (input.choice !== correct) {
    result = { status: "wrong", correct, roundComplete: false };
    record(state, slot, now - slot.presentedAt, false, round.id);
    fail(state, "wrong", now, input.choice);
  } else {
    slot.state = "correct";
    slot.answeredAt = now;
    slot.activeMs = now - slot.presentedAt;
    record(state, slot, slot.activeMs, true, round.id);
    if (slot.kind === "review") state.pendingReviews = state.pendingReviews.filter((m) => m !== slot.micro);
    const next = nextOpen(round, input.position + 1);
    result = { status: "correct", correct, roundComplete: false };
    if (next < 0) {
      round.position = round.size;
      result.roundComplete = true;
      result.advance = completeRound(state, now);
    } else {
      round.position = next;
    }
  }
  state.processed[input.nonce] = result;
  const keys = Object.keys(state.processed);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete state.processed[k];
  return result;
}

function record(state: SatState, slot: SatSlot, ms: number, ok: boolean, roundId: string, sign: 1 | -1 = 1) {
  const s = (state.stats[slot.micro] ??= { attempts: 0, correct: 0 });
  s.attempts = Math.max(0, s.attempts + sign);
  if (ok) s.correct = Math.max(0, s.correct + sign);
  const f = (state.familyStats[slot.family] ??= { attempts: 0, correct: 0, totalMs: 0 });
  f.attempts = Math.max(0, f.attempts + sign);
  f.totalMs = Math.max(0, f.totalMs + sign * Math.max(0, ms));
  if (ok) f.correct = Math.max(0, f.correct + sign);
  const mp = (state.micro[slot.micro] ??= { answered: 0, correct: 0, roundsCorrect: [] });
  mp.answered = Math.max(0, mp.answered + sign);
  if (ok) {
    mp.correct = Math.max(0, mp.correct + sign);
    if (sign > 0 && !mp.roundsCorrect.includes(roundId)) mp.roundsCorrect = [...mp.roundsCorrect, roundId].slice(-6);
  }
  state.metrics.answered = Math.max(0, state.metrics.answered + sign);
  if (ok) state.metrics.correct = Math.max(0, state.metrics.correct + sign);
  else state.metrics.wrongByFamily[slot.family] = Math.max(0, (state.metrics.wrongByFamily[slot.family] ?? 0) + sign);
}

/** Si la pregunta abierta (o la ronda global) se pasó de tiempo, cuenta como fallo. Se llama al consultar el estado. */
export function checkTimeout(state: SatState, now: number): boolean {
  const round = state.round;
  const slot = round.slots[round.position];
  if (!round.started || slot?.state !== "revealed" || !overdue(round, now)) return false;
  fail(state, "timeout", now);
  return true;
}

let roundCounter = 0;
const nextRoundId = (now: number) => `r${now.toString(36)}${(roundCounter++).toString(36)}`;

/** Un error (o agotar el tiempo): todo el desafío vuelve al nivel 1. Lo aprendido y lo visto se conserva. */
function fail(state: SatState, reason: "wrong" | "timeout", now: number, choice: OptionId | null = null) {
  const round = state.round;
  const slot = round.slots[round.position];
  state.failure = {
    id: `f${now.toString(36)}${(roundCounter++).toString(36)}`,
    reason,
    itemId: slot?.itemId ?? null,
    choice,
    micro: slot?.micro ?? "",
    family: slot?.family ?? 0,
    at: now,
    level: state.level,
    position: round.position,
    acknowledged: false,
    snapshot: { level: state.level, timeStep: state.timeStep, round: structuredClone(round) },
  };
  state.restoreOffer = null;
  state.metrics.resets++;
  if (reason === "timeout") state.metrics.timeouts++;
  log(state, now, "reset", `${reason} en nivel ${state.level}, pregunta ${round.position + 1}/${round.size}`);
  // Conceptos nuevos de esta ronda que no llegaron a repasarse: quedan pendientes para cuando se vuelvan a enseñar.
  addDeferred(state, round);
  state.level = 1;
  state.timeStep = null;
  state.seed = (state.seed * 31 + 7) >>> 0;
  state.round = newRound(1, null, state.stats, state.seed, nextRoundId(now), state.pendingReviews);
}

/** Conceptos presentados en la ronda sin un repaso acertado: repaso aplazado (no se pierde). */
function addDeferred(state: SatState, round: SatRound) {
  for (const s of round.slots) {
    // Solo lo que de verdad se presentó (lo que no se llegó a enseñar se enseñará cuando toque).
    if (s.kind !== "intro" || s.state === "pending") continue;
    const reviewed = round.slots.some((r) => r.kind === "review" && r.micro === s.micro && r.state === "correct");
    if (!reviewed && !state.pendingReviews.includes(s.micro)) state.pendingReviews.push(s.micro);
  }
}

const ADVANCED_BANDS = new Set(["hard", "por encima"]);

/**
 * Condición de victoria, comprobada explícitamente: cantidad completa, cero errores (todas correctas),
 * las 11 familias, tiempo válido, preguntas nuevas, y para la velocidad: 50 preguntas, dificultad avanzada
 * de la ronda, banda "hard"/"por encima" CONFIRMADA por la revisión ciega en cada pregunta, y todo enseñado.
 */
export function roundPassed(round: SatRound): { ok: boolean; advanced: boolean } {
  const allCorrect = round.slots.length === round.size && round.slots.every((s) => s.state === "correct" && s.itemId);
  const coverage = familiesIn(round.slots).size === FAMILIES.length;
  const timeOk =
    round.timeMode === "global"
      ? round.slots.reduce((a, s) => a + (s.activeMs ?? 0), 0) <= round.budgetMs + GRACE_MS
      : round.slots.every((s) => (s.activeMs ?? 0) <= QUESTION_MS + GRACE_MS);
  const allFresh = round.slots.every((s) => s.fresh);
  const ok = allCorrect && coverage && timeOk && allFresh;
  const reviewedHard = round.slots.every((s) => s.band && ADVANCED_BANDS.has(s.band));
  const advanced = ok && round.size === MAX_ROUND && round.difficulty >= ADVANCED_MIN_DIFFICULTY && reviewedHard && allMicrosTaughtBy(round.level);
  return { ok, advanced };
}

function completeRound(state: SatState, now: number): AnswerResult["advance"] {
  const round = state.round;
  const { ok, advanced } = roundPassed(round);
  addDeferred(state, round);
  if (!ok) {
    // No debería pasar (se controla pregunta a pregunta). Sin castigo: se repite el nivel con otra ronda.
    log(state, now, "round-invalid", `nivel ${round.level}`);
    state.seed = (state.seed * 31 + 11) >>> 0;
    state.round = newRound(state.level, state.timeStep, state.stats, state.seed, nextRoundId(now), state.pendingReviews);
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
    // 50/50 en dificultad avanzada sin la banda confirmada en TODAS sus preguntas: no abre la velocidad.
    if (round.size === MAX_ROUND && round.difficulty >= ADVANCED_MIN_DIFFICULTY) log(state, now, "speed-gate-blocked", "faltaba banda avanzada revisada en alguna pregunta");
    state.level++;
    advance = "level";
  }
  const best = state.metrics.best;
  if (state.level > best.level) best.level = state.level;
  if (state.timeStep !== null && (best.timeStep === null || state.timeStep > best.timeStep)) best.timeStep = state.timeStep;
  best.roundSize = Math.max(best.roundSize, round.size);
  log(state, now, "round-passed", `nivel ${round.level}${round.timeStep !== null ? `, tiempo ${round.budgetMs / 1000}s` : ""}`);
  state.seed = (state.seed * 31 + 13) >>> 0;
  state.round = newRound(state.level, state.timeStep, state.stats, state.seed, nextRoundId(now), state.pendingReviews);
  return advance;
}

export function acknowledgeFailure(state: SatState) {
  if (state.failure) state.failure.acknowledged = true;
}

/** ¿Ha hecho algo el estudiante en la ronda actual (alguna pregunta mostrada)? */
function roundTouched(round: SatRound) {
  return round.slots.some((s) => s.state !== "pending");
}

/**
 * Una revisión CONFIRMÓ que la pregunta `itemId` era defectuosa. Se anulan solo sus consecuencias, sin
 * borrar intentos posteriores (el historial y los eventos se conservan):
 * - Abierta ahora: se sustituye por otra nueva en la misma posición (hay que responderla). Política de
 *   tiempo: el tiempo pasado en la pregunta inválida no cuenta (la nueva empieza su propio reloj).
 * - Acertada en la ronda actual: ese acierto se anula en métricas y la posición se vuelve a pedir con otra.
 * - Causó el último reinicio: el reinicio se anula en métricas. Si no has empezado nada desde entonces, se
 *   recupera la ronda donde estabas (con otra pregunta en esa posición); si ya seguiste, se te OFRECE
 *   recuperarla sin tocar lo que has hecho después.
 */
export function applyDefect(state: SatState, itemId: string, now: number): string {
  state.metrics.defectsConfirmed++;
  const round = state.round;
  const idx = round.slots.findIndex((s) => s.itemId === itemId);
  if (idx >= 0) {
    const slot = round.slots[idx];
    if (slot.state === "correct") record(state, slot, slot.activeMs ?? 0, true, round.id, -1);
    // Si ya se había pasado esa posición, se vuelve a pedir al final de la ronda (ver nextOpen).
    Object.assign(slot, { itemId: null, band: undefined, state: "pending", presentedAt: undefined, answeredAt: undefined, activeMs: undefined, fresh: undefined });
    log(state, now, "defect", `pregunta sustituida en la posición ${idx + 1}`);
    return "La pregunta era defectuosa: la cambié por otra nueva en la misma posición. Esa posición hay que responderla.";
  }
  const f = state.failure;
  if (f && f.itemId === itemId && !f.voided) {
    f.voided = true;
    state.metrics.resets = Math.max(0, state.metrics.resets - 1);
    if (f.reason === "timeout") state.metrics.timeouts = Math.max(0, state.metrics.timeouts - 1);
    else record(state, { kind: "review", micro: f.micro, family: f.family, itemId: null, state: "pending" }, 0, false, "", -1);
    const restored = structuredClone(f.snapshot.round);
    const slot = restored.slots[f.position];
    if (slot) Object.assign(slot, { itemId: null, band: undefined, state: "pending", presentedAt: undefined, answeredAt: undefined, activeMs: undefined, fresh: undefined });
    if (!roundTouched(state.round)) {
      state.level = f.snapshot.level;
      state.timeStep = f.snapshot.timeStep;
      state.round = restored;
      state.failure = null;
      log(state, now, "reset-voided", "restaurada la ronda anterior");
      return "Tenías razón: la pregunta era defectuosa. Anulé el reinicio y recuperé tu ronda (con otra pregunta en esa posición).";
    }
    state.restoreOffer = { failureId: f.id, level: f.snapshot.level, timeStep: f.snapshot.timeStep, round: restored, at: now };
    log(state, now, "reset-voided", "ofrecida la ronda anterior");
    return "Tenías razón: la pregunta era defectuosa. Anulé el reinicio en tus métricas y puedes recuperar tu ronda anterior.";
  }
  log(state, now, "defect", "pregunta de una ronda anterior");
  return "La pregunta era defectuosa y quedó retirada.";
}

/** Aceptar la oferta: vuelve la ronda anterior. Lo hecho después queda en el historial y en las métricas. */
export function acceptRestore(state: SatState, now: number): boolean {
  const o = state.restoreOffer;
  if (!o) return false;
  state.level = o.level;
  state.timeStep = o.timeStep;
  state.round = o.round;
  state.restoreOffer = null;
  log(state, now, "restore-accepted");
  return true;
}

/** Estado de un microobjetivo para el estudiante. */
export function microStatus(mp: MicroProgress | undefined): "sin empezar" | "lección vista" | "respondida" | "demostrada" {
  if (!mp) return "sin empezar";
  // Demostrado: aciertos en al menos 2 rondas distintas y ≥ 80 % de acierto.
  if (mp.roundsCorrect.length >= 2 && mp.answered > 0 && mp.correct / mp.answered >= 0.8) return "demostrada";
  if (mp.answered > 0) return "respondida";
  return mp.lessonShownAt ? "lección vista" : "sin empezar";
}

/** Auditoría del temario para un usuario: los microobjetivos REALES del inventario y su estado. */
export function curriculumAudit(state: SatState) {
  const taught = new Set([...taughtBefore(state.metrics.best.level + 1)]);
  return MICROS.map((m) => ({
    id: m.id,
    family: m.family,
    title: m.title,
    scheduledBy: taught.has(m.id),
    status: microStatus(state.micro[m.id]),
    pendingReview: state.pendingReviews.includes(m.id),
  }));
}
