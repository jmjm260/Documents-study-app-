// Planificador de rondas: qué concepto se enseña y qué se repasa en cada posición.
// - Aprendizaje: A1 → B1 → A2 → C1 → (repaso) → D1 → … : se explica antes de evaluar un concepto nuevo y
//   se repasan los anteriores con preguntas DIFERENTES.
// - El resto de la ronda reparte repasos de todo lo enseñado, reforzando lo que más costó, con cobertura
//   equilibrada: cada una de las 11 familias tiene al menos una pregunta PRINCIPAL.
// - Rondas sin conceptos nuevos (dificultad y velocidad): solo evaluación, repartida por familias como el SAT.
import { FAMILIES, MICROS, MICRO_BY_ID, type Micro } from "./curriculum";
import { INTROS_PER_LEVEL, MAX_ROUND } from "./config";

export type SlotKind = "intro" | "review";
export type PlannedSlot = { kind: SlotKind; micro: string; family: number };
export type MicroStats = Record<string, { attempts: number; correct: number }>;

/** Qué microobjetivos se enseñan en cada nivel (1.º: uno de cada familia; luego, por turnos entre familias). */
export function introSchedule(): string[][] {
  const levels: string[][] = [FAMILIES.map((f) => MICROS.find((x) => x.family === f.id)!.id)];
  const remaining = MICROS.filter((x) => !levels[0].includes(x.id));
  // Por turnos entre familias, respetando el orden (y así los prerrequisitos) dentro de cada una.
  const queues = FAMILIES.map((f) => remaining.filter((x) => x.family === f.id));
  const order: Micro[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) order.push(q.shift()!);
  let i = 0;
  for (const count of INTROS_PER_LEVEL.slice(1)) {
    if (i >= order.length) break;
    levels.push(order.slice(i, i + count).map((x) => x.id));
    i += count;
  }
  if (i < order.length) levels[levels.length - 1].push(...order.slice(i).map((x) => x.id));
  return levels;
}

const SCHEDULE = introSchedule();

export function introsForLevel(level: number): string[] {
  return SCHEDULE[level - 1] ?? [];
}

/** Todo lo enseñado ANTES de este nivel. */
export function taughtBefore(level: number): string[] {
  return SCHEDULE.slice(0, Math.max(0, level - 1)).flat();
}

/** ¿Ya se enseñaron todos los microobjetivos obligatorios (incluido este nivel)? */
export function allMicrosTaughtBy(level: number): boolean {
  return SCHEDULE.slice(0, level).flat().length >= MICROS.length;
}

/** Generador pseudoaleatorio con semilla (las rondas se pueden reproducir en pruebas). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const slot = (kind: SlotKind, micro: string): PlannedSlot => ({ kind, micro, family: MICRO_BY_ID.get(micro)!.family });

/** Peso de repaso: más si costó (errores) o si casi no se ha practicado. */
function weakness(stats: MicroStats, micro: string): number {
  const s = stats[micro];
  if (!s || s.attempts === 0) return 2;
  return 1 + 3 * (1 - s.correct / s.attempts) + 1 / (1 + s.attempts);
}

function pickWeighted(pool: string[], stats: MicroStats, rand: () => number, avoid?: string): string {
  const options = pool.length > 1 && avoid ? pool.filter((p) => p !== avoid) : pool;
  const weights = options.map((p) => weakness(stats, p));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) if ((r -= weights[i]) <= 0) return options[i];
  return options[options.length - 1];
}

/**
 * `mustReview`: microobjetivos ya enseñados cuyo repaso quedó aplazado (por falta de sitio en una ronda
 * anterior). Entran en esta ronda antes que el resto de repasos, para que no se pierdan.
 */
export function planRound(opts: { level: number; size: number; stats: MicroStats; seed: number; mustReview?: string[] }): PlannedSlot[] {
  const rand = rng(opts.seed);
  const intros = introsForLevel(opts.level);
  const taught = [...taughtBefore(opts.level), ...intros];
  const pending = (opts.mustReview ?? []).filter((m) => taughtBefore(opts.level).includes(m));

  if (!intros.length) {
    const evalSlots = evaluationRound(Math.min(opts.size, MAX_ROUND), taught, opts.stats, rand);
    // Los aplazados sustituyen a un repaso de su misma familia (así el reparto por familias no cambia).
    for (const m of pending) {
      if (evalSlots.some((s) => s.micro === m)) continue;
      const fam = MICRO_BY_ID.get(m)!.family;
      const i = evalSlots.findIndex((s) => s.family === fam && evalSlots.filter((x) => x.micro === s.micro).length > 1);
      if (i >= 0) evalSlots[i] = slot("review", m);
    }
    return evalSlots;
  }

  // 1) Cadena de aprendizaje: A1, B1, A2, C1, B2, D1, C2… (cada concepto nuevo se repasa tras el siguiente).
  const chain: PlannedSlot[] = [];
  intros.forEach((micro, k) => {
    chain.push(slot("intro", micro));
    if (k >= 1) chain.push(slot("review", intros[k - 1]));
  });

  // 2) Familias que aún no tienen pregunta en la ronda: un repaso de cada una (de lo ya enseñado).
  const covered = new Set(chain.map((s) => s.family));
  const missing = FAMILIES.filter((f) => !covered.has(f.id)).map((f) => {
    const pool = taught.filter((t) => MICRO_BY_ID.get(t)!.family === f.id);
    return slot("review", pickWeighted(pool, opts.stats, rand));
  });
  // Repaso del último concepto nuevo si cabe en el tamaño propuesto (si no, se repasa en la ronda siguiente).
  if (chain.length + missing.length < opts.size) chain.push(slot("review", intros[intros.length - 1]));

  // Repasos aplazados de rondas anteriores (que no estén ya en la cadena).
  const deferred = pending.filter((m) => !chain.some((s) => s.micro === m) && !missing.some((s) => s.micro === m)).map((m) => slot("review", m));
  // El planificador puede ampliar la ronda si necesita sitio, sin pasar de 50.
  const size = Math.min(MAX_ROUND, Math.max(opts.size, chain.length + missing.length + deferred.length));
  const extra: PlannedSlot[] = [...missing, ...deferred];

  // 3) Repaso acumulativo hasta completar: todo lo enseñado, más peso a lo que costó, familias equilibradas.
  const familyCount = new Map<number, number>();
  for (const s of [...chain, ...extra]) familyCount.set(s.family, (familyCount.get(s.family) ?? 0) + 1);
  while (chain.length + extra.length < size) {
    // La familia con menos preguntas hasta ahora (desempate al azar), y dentro de ella el micro más flojo.
    const families = [...new Set(taught.map((t) => MICRO_BY_ID.get(t)!.family))];
    const min = Math.min(...families.map((f) => familyCount.get(f) ?? 0));
    const candidates = families.filter((f) => (familyCount.get(f) ?? 0) === min);
    const family = candidates[Math.floor(rand() * candidates.length)];
    const micro = pickWeighted(taught.filter((t) => MICRO_BY_ID.get(t)!.family === family), opts.stats, rand);
    extra.push(slot("review", micro));
    familyCount.set(family, (familyCount.get(family) ?? 0) + 1);
  }

  // 4) Mezclar: los 3 primeros (A1, B1, A2) se quedan; el resto de repasos se reparte entre la cadena.
  const head = chain.slice(0, 3);
  const rest = chain.slice(3);
  const merged: PlannedSlot[] = [...head];
  const gap = rest.length ? Math.max(1, Math.floor(rest.length / Math.max(1, extra.length))) : 0;
  let e = 0;
  rest.forEach((s, i) => {
    merged.push(s);
    if (gap && (i + 1) % gap === 0 && e < extra.length && s.kind === "review") merged.push(extra[e++]);
  });
  merged.push(...extra.slice(e));
  return avoidRepeats(merged.slice(0, size));
}

/** Ronda sin conceptos nuevos: reparto por familias como el SAT (13/10/14/13 en 50), al menos 1 de cada. */
function evaluationRound(size: number, taught: string[], stats: MicroStats, rand: () => number): PlannedSlot[] {
  const quotas = FAMILIES.map((f) => ({ id: f.id, n: Math.max(1, Math.round((f.weight50 * size) / MAX_ROUND)) }));
  let total = quotas.reduce((a, q) => a + q.n, 0);
  // Ajuste fino para sumar exactamente `size` (sin bajar ninguna familia de 1).
  for (let i = 0; total !== size; i = (i + 1) % quotas.length) {
    if (total > size && quotas[i].n > 1) {
      quotas[i].n--;
      total--;
    } else if (total < size) {
      quotas[i].n++;
      total++;
    }
  }
  const slots: PlannedSlot[] = [];
  for (const q of quotas) {
    const pool = taught.filter((t) => MICRO_BY_ID.get(t)!.family === q.id);
    let last: string | undefined;
    for (let i = 0; i < q.n; i++) {
      last = pickWeighted(pool, stats, rand, last);
      slots.push(slot("review", last));
    }
  }
  // Barajar para que las familias no vayan en bloque.
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return avoidRepeats(slots);
}

/** Evita el mismo microobjetivo dos veces seguidas (sin mover los 3 primeros del aprendizaje). */
function avoidRepeats(slots: PlannedSlot[]): PlannedSlot[] {
  for (let i = 3; i < slots.length; i++) {
    if (slots[i].micro !== slots[i - 1].micro) continue;
    const j = slots.findIndex((s, k) => k > i && s.micro !== slots[i - 1].micro && s.kind === slots[i].kind);
    if (j > 0) [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

export function familiesIn(slots: { family: number }[]): Set<number> {
  return new Set(slots.map((s) => s.family));
}
