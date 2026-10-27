// Servicio del entrenamiento SAT (solo servidor).
// - Estado, preguntas con su CLAVE y reservas viven aquí, en un archivo por usuario (.data/sat/<id>.json),
//   con escrituras atómicas y una cola por usuario: un doble clic nunca procesa dos veces lo mismo.
// - El navegador solo recibe la pregunta SIN clave; la clave se compara aquí.
// - Búfer: mientras el estudiante responde, se generan, validan, revisan y reservan las siguientes preguntas
//   (y las fáciles para un posible reinicio). Una ronda cronometrada sin lecciones no empieza sin sus N preguntas.
// Hoy la identidad es la del dispositivo (no hay cuentas): el historial "sin repetir" es por dispositivo.
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BATCH_SIZE, LOOKAHEAD, MAX_CONCURRENT_JOBS, MAX_ITEMS_PER_DAY, RESET_RESERVE, levelInfo } from "../sat/config";
import { FAMILIES, FAMILY_BY_ID, MICRO_BY_ID } from "../sat/curriculum";
import {
  acknowledgeFailure,
  answer,
  checkTimeout,
  initialState,
  remainingMs,
  reveal,
  SatError,
  startRound,
  undoFailure,
  usedMs,
  type AnswerResult,
  type SatState,
} from "../sat/engine";
import { isDuplicate, leaksAnswer, publicItem, type OptionId, type SatItem } from "../sat/items";
import { familiesIn, introsForLevel, planRound, taughtBefore } from "../sat/planner";
import { contestItem, generateBatch, generateLesson, reviewItems } from "./sat-ai";

const DIR = join(process.cwd(), ".data", "sat");
const USER_RE = /^[A-Za-z0-9-]{8,64}$/;

type Lesson = { title: string; body: string };

type UserData = {
  state: SatState;
  /** Preguntas reservadas o ya mostradas a este usuario (con clave: nunca salen tal cual). */
  items: Record<string, SatItem>;
  /** Preguntas validadas, aún sin asignar ni mostrar (no cuentan como vistas). */
  pool: string[];
  daily: { day: string; generated: number };
  /** Aviso técnico (no es un fallo del estudiante). */
  notice: string | null;
  retryAt: number;
};

// ---------- Archivos ----------

function file(userId: string) {
  if (!USER_RE.test(userId)) throw new Error("usuario no válido");
  return join(DIR, `${userId}.json`);
}

async function writeAtomic(target: string, data: unknown) {
  await mkdir(DIR, { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data), "utf8");
  await rename(tmp, target);
}

async function read(userId: string): Promise<UserData> {
  try {
    return JSON.parse(await readFile(file(userId), "utf8")) as UserData;
  } catch {
    return { state: initialState(Math.floor(Math.random() * 2 ** 31), randomUUID()), items: {}, pool: [], daily: { day: "", generated: 0 }, notice: null, retryAt: 0 };
  }
}

const queues = new Map<string, Promise<unknown>>();

/** Todo cambio pasa por aquí: en cola por usuario, leer → cambiar → guardar (atómico). */
function mutate<T>(userId: string, fn: (data: UserData) => T | Promise<T>): Promise<T> {
  const run = (queues.get(userId) ?? Promise.resolve()).then(async () => {
    const data = await read(userId);
    const result = await fn(data);
    pruneItems(data);
    await writeAtomic(file(userId), data);
    return result;
  });
  queues.set(userId, run.catch(() => {}));
  return run;
}

/** Las preguntas viejas ya respondidas se pueden olvidar: su huella sigue en el historial de vistas. */
function pruneItems(data: UserData) {
  const keep = new Set([...data.pool, ...data.state.round.slots.map((s) => s.itemId).filter(Boolean) as string[]]);
  if (data.state.failure?.itemId) keep.add(data.state.failure.itemId);
  const ids = Object.keys(data.items);
  if (ids.length <= 400) return;
  for (const id of ids) if (!keep.has(id) && Object.keys(data.items).length > 300) delete data.items[id];
}

let lessons: Record<string, Lesson> | null = null;
const LESSONS_FILE = join(DIR, "lessons.json");
const band = (d: number) => (d <= 2 ? 1 : d <= 4 ? 2 : 3);
const lessonKey = (micro: string, difficulty: number) => `${micro}|${band(difficulty)}`;

async function loadLessons(): Promise<Record<string, Lesson>> {
  if (lessons) return lessons;
  try {
    lessons = JSON.parse(await readFile(LESSONS_FILE, "utf8"));
  } catch {
    lessons = {};
  }
  return lessons!;
}

// ---------- Asignar preguntas del búfer a la ronda ----------

/** Posiciones que deben tener pregunta ya: las próximas, o TODAS si la ronda cronometrada lo exige. */
function windowSlots(state: SatState) {
  const r = state.round;
  const end = r.requiresFullReserve ? r.size : Math.min(r.size, r.position + LOOKAHEAD);
  return r.slots.slice(r.position, end).map((s, i) => ({ slot: s, index: r.position + i }));
}

function assign(data: UserData, lessonMap: Record<string, Lesson>) {
  const { state } = data;
  const seen = state.seen.fps;
  const noIntros = !state.round.slots.some((s) => s.kind === "intro");
  for (const { slot } of windowSlots(state)) {
    // Si la lección llegó después y regala la respuesta de su pregunta, esa pregunta vuelve al búfer.
    if (slot.itemId && slot.state === "pending" && slot.kind === "intro") {
      const lesson = lessonMap[lessonKey(slot.micro, state.round.difficulty)];
      if (lesson && data.items[slot.itemId] && leaksAnswer(lesson.body, data.items[slot.itemId])) {
        data.pool.push(slot.itemId);
        slot.itemId = null;
      }
    }
    if (slot.itemId) continue;
    const lesson = slot.kind === "intro" ? lessonMap[lessonKey(slot.micro, state.round.difficulty)] : undefined;
    const fits = (it: SatItem | undefined, exactMicro: boolean) =>
      it &&
      it.status === "validated" &&
      it.difficulty === state.round.difficulty &&
      (exactMicro ? it.micros[0] === slot.micro : it.family === slot.family) &&
      !isDuplicate(it.fp, seen) &&
      !(lesson && leaksAnswer(lesson.body, it));
    let pick = data.pool.find((id) => fits(data.items[id], true));
    // En rondas de solo evaluación vale otra habilidad de la MISMA familia (así se puede preparar la ronda entera antes).
    if (!pick && noIntros && slot.kind === "review") pick = data.pool.find((id) => fits(data.items[id], false));
    if (!pick) continue;
    data.pool = data.pool.filter((id) => id !== pick);
    slot.itemId = pick;
    slot.micro = data.items[pick].micros[0];
  }
}

type Need = { micro: string; difficulty: number; count: number };

/** Qué falta preparar: la ronda actual, el comienzo de un posible reinicio y el de la siguiente ronda. */
function computeNeeds(data: UserData): Need[] {
  const { state } = data;
  const want = new Map<string, Need>();
  const add = (micro: string, difficulty: number) => {
    const k = `${micro}|${difficulty}`;
    const n = want.get(k) ?? { micro, difficulty, count: 0 };
    n.count++;
    want.set(k, n);
  };
  for (const { slot } of windowSlots(state)) if (!slot.itemId) add(slot.micro, state.round.difficulty);
  // Reinicio: el nivel 1 siempre empieza igual (A1, B1, A2, C1…), así que sus primeras preguntas se preparan ya.
  for (const s of planRound({ level: 1, size: levelInfo(1).size, stats: {}, seed: 1 }).slice(0, RESET_RESERVE)) add(s.micro, levelInfo(1).difficulty);
  // Cerca del final de la ronda: el comienzo de la siguiente.
  const r = state.round;
  if (r.size - r.position <= LOOKAHEAD) {
    const next = Math.min(state.level + 1, 99);
    const nextIntros = introsForLevel(next);
    const info = levelInfo(next);
    if (nextIntros.length) nextIntros.slice(0, 3).forEach((m) => add(m, info.difficulty));
    else for (const f of FAMILIES) add(pickMicro(f.id, next), state.timeStep !== null ? r.difficulty : info.difficulty);
  }
  // Restar lo que ya hay en el búfer.
  const avail = new Map<string, number>();
  for (const id of data.pool) {
    const it = data.items[id];
    if (it) avail.set(`${it.micros[0]}|${it.difficulty}`, (avail.get(`${it.micros[0]}|${it.difficulty}`) ?? 0) + 1);
  }
  return [...want.values()]
    .map((n) => ({ ...n, count: n.count - (avail.get(`${n.micro}|${n.difficulty}`) ?? 0) }))
    .filter((n) => n.count > 0);
}

function pickMicro(family: number, level: number): string {
  const taught = [...taughtBefore(level), ...introsForLevel(level)].filter((m) => MICRO_BY_ID.get(m)?.family === family);
  return taught[Math.floor(Math.random() * taught.length)] ?? `F${family}.1`;
}

// ---------- Trabajos en segundo plano ----------

const running = new Map<string, Set<string>>();
const today = () => new Date().toISOString().slice(0, 10);

/** Rellena el búfer (no bloquea al estudiante). Se llama tras cada acción. */
export function refill(userId: string) {
  void (async () => {
    const lessonMap = await loadLessons();
    const { needs, lessonNeeds, blocked } = await mutate(userId, (data) => {
      assign(data, lessonMap);
      if (data.daily.day !== today()) data.daily = { day: today(), generated: 0 };
      const capped = data.daily.generated >= MAX_ITEMS_PER_DAY;
      data.notice = capped ? "Tocorito llegó al límite de preguntas nuevas de hoy. Mañana sigue." : data.notice;
      const lessonNeeds = windowSlots(data.state)
        .filter(({ slot }) => slot.kind === "intro")
        .map(({ slot }) => ({ micro: slot.micro, difficulty: data.state.round.difficulty }))
        .filter((l) => !lessonMap[lessonKey(l.micro, l.difficulty)]);
      return { needs: computeNeeds(data), lessonNeeds, blocked: capped || Date.now() < data.retryAt };
    });
    if (blocked) return;
    const jobs = (running.get(userId) ?? new Set<string>());
    running.set(userId, jobs);
    for (const l of lessonNeeds) {
      const key = `lesson:${lessonKey(l.micro, l.difficulty)}`;
      if (jobs.has(key) || jobs.size >= MAX_CONCURRENT_JOBS + 1) continue;
      jobs.add(key);
      void lessonJob(userId, l.micro, l.difficulty).finally(() => jobs.delete(key));
    }
    for (const n of needs) {
      const key = `items:${n.micro}|${n.difficulty}`;
      if (jobs.has(key) || [...jobs].filter((j) => j.startsWith("items:")).length >= MAX_CONCURRENT_JOBS) continue;
      jobs.add(key);
      void itemsJob(userId, n).finally(() => {
        jobs.delete(key);
        refill(userId);
      });
    }
  })().catch((err) => console.error("sat: refill falló:", err instanceof Error ? err.message : err));
}

async function lessonJob(userId: string, micro: string, difficulty: number) {
  try {
    const lesson = await generateLesson(micro, difficulty);
    if (!lesson) return;
    const map = await loadLessons();
    map[lessonKey(micro, difficulty)] = lesson;
    await writeAtomic(LESSONS_FILE, map);
  } catch (err) {
    await technicalProblem(userId, err);
  }
}

async function itemsJob(userId: string, need: Need) {
  try {
    const snapshot = await read(userId);
    // Para no repetir temas: los comienzos de lo ya visto de esta habilidad.
    const avoid = Object.values(snapshot.items)
      .filter((it) => it.micros[0] === need.micro)
      .map((it) => it.passage.slice(0, 90));
    const { items, rejected: invalid } = await generateBatch({ micro: need.micro, difficulty: need.difficulty, count: Math.min(BATCH_SIZE + 1, need.count + 1), avoid });
    // Sin duplicados (con lo visto, lo reservado y entre sí) ANTES de gastar en la revisión.
    const others = [...snapshot.state.seen.fps, ...Object.values(snapshot.items).map((it) => it.fp)];
    const unique: SatItem[] = [];
    for (const it of items) if (!isDuplicate(it.fp, [...others, ...unique.map((u) => u.fp)])) unique.push(it);
    const { ok, rejected } = await reviewItems(unique);
    // Solo motivos (nunca el contenido), para vigilar la calidad del banco.
    console.info(`sat: ${need.micro} d${need.difficulty}: ${items.length + invalid.length} generadas, ${ok.length} aprobadas`, [...invalid, ...rejected, ...(items.length - unique.length ? [`${items.length - unique.length} duplicadas`] : [])]);
    await mutate(userId, (data) => {
      data.daily.generated += items.length;
      data.notice = null;
      for (const it of ok) {
        if (isDuplicate(it.fp, [...data.state.seen.fps, ...data.pool.map((id) => data.items[id]?.fp).filter(Boolean)])) continue;
        data.items[it.id] = it;
        data.pool.push(it.id);
      }
    });
  } catch (err) {
    await technicalProblem(userId, err);
  }
}

/** Un fallo de la IA o de la red NO es un error académico: se avisa y se reintenta más tarde. */
async function technicalProblem(userId: string, err: unknown) {
  const message = (err as { friendly?: string })?.friendly ?? "Tocorito tuvo un problema técnico preparando preguntas. Reintentando…";
  console.error("sat: trabajo falló:", err instanceof Error ? err.message : err);
  await mutate(userId, (data) => {
    data.notice = message;
    data.retryAt = Date.now() + 30_000;
  });
  setTimeout(() => refill(userId), 31_000);
}

// ---------- Vista pública (lo que ve el navegador) ----------

export type SatView = ReturnType<typeof buildView>;

function buildView(data: UserData, lessonMap: Record<string, Lesson>, now: number) {
  const { state } = data;
  const r = state.round;
  const slot = r.slots[r.position];
  const item = slot?.itemId ? data.items[slot.itemId] : undefined;
  const micro = slot ? MICRO_BY_ID.get(slot.micro) : undefined;
  const revealed = slot?.state === "revealed";
  const lesson = slot?.kind === "intro" ? lessonMap[lessonKey(slot.micro, r.difficulty)] ?? null : null;
  const f = state.failure && !state.failure.acknowledged ? state.failure : null;
  const failedItem = f?.itemId ? data.items[f.itemId] : undefined;
  return {
    serverNow: now,
    level: state.level,
    phase: r.phase,
    timeStep: state.timeStep,
    notice: data.notice,
    round: {
      id: r.id,
      size: r.size,
      difficulty: r.difficulty,
      timeMode: r.timeMode,
      budgetMs: r.budgetMs,
      usedMs: usedMs(r, now),
      remainingMs: remainingMs(r, now),
      position: r.position,
      started: r.started,
      requiresFullReserve: r.requiresFullReserve,
      ready: r.slots.filter((s) => s.itemId).length,
      covered: [...familiesIn(r.slots.filter((s) => s.state === "correct"))],
    },
    slide: slot
      ? {
          kind: slot.kind,
          family: slot.family,
          micro: { id: slot.micro, title: micro?.title ?? "" },
          // La explicación solo en conceptos nuevos (y no la pregunta hasta pulsar "Empezar pregunta").
          lesson,
          ready: Boolean(item) && (slot.kind === "review" || Boolean(lesson)),
          revealed,
          item: revealed && item ? publicItem(item) : null,
        }
      : null,
    failure: f
      ? {
          reason: f.reason,
          level: f.level,
          position: f.position,
          choice: f.choice,
          item: failedItem ? { ...publicItem(failedItem), correct: failedItem.correct, explanation: failedItem.explanation, verification: failedItem.verification, distractors: failedItem.distractors } : null,
        }
      : null,
    metrics: {
      ...state.metrics,
      seen: state.seen.ids.length,
      families: FAMILIES.map((fam) => ({ id: fam.id, name: fam.name, label: fam.label, ...(state.familyStats[fam.id] ?? { attempts: 0, correct: 0, totalMs: 0 }) })),
      micros: Object.entries(state.stats).map(([id, s]) => ({ id, title: MICRO_BY_ID.get(id)?.title ?? id, family: MICRO_BY_ID.get(id)?.family ?? 0, ...s })),
    },
  };
}

// ---------- Acciones ----------

export async function getView(userId: string) {
  const lessonMap = await loadLessons();
  const view = await mutate(userId, (data) => {
    checkTimeout(data.state, Date.now());
    assign(data, lessonMap);
    return buildView(data, lessonMap, Date.now());
  });
  refill(userId);
  return view;
}

export async function startTimedRound(userId: string, roundId: string) {
  await mutate(userId, (data) => startRound(data.state, roundId));
  return getView(userId);
}

/** Muestra la pregunta actual. Antes vuelve a comprobar que sea nueva (por si otra pestaña/rato la mostró). */
export async function revealQuestion(userId: string, roundId: string, position: number) {
  await mutate(userId, (data) => {
    const slot = data.state.round.slots[position];
    const item = slot?.itemId ? data.items[slot.itemId] : undefined;
    if (slot?.state === "pending" && item && (isDuplicate(item.fp, data.state.seen.fps) || item.status !== "validated")) {
      // Repetida o retirada: se cambia por otra (sin castigo).
      item.status = item.status === "validated" ? "rejected" : item.status;
      slot.itemId = null;
      return;
    }
    reveal(data.state, roundId, position, Date.now(), item?.fp ?? null, true);
  });
  return getView(userId);
}

export async function submitAnswer(userId: string, input: { roundId: string; position: number; choice: OptionId; nonce: string }) {
  const result = await mutate(userId, (data): AnswerResult & { explanation: string | null } => {
    const slot = data.state.round.slots[input.position];
    const done = data.state.processed[input.nonce];
    if (done) return { ...done, explanation: null };
    const item = slot?.itemId ? data.items[slot.itemId] : undefined;
    if (!item) throw new SatError("not_ready", "La pregunta no está disponible.");
    const r = answer(data.state, input, item.correct, Date.now());
    // Justificación breve tras acertar (el detalle completo de un fallo va en la pantalla de reinicio).
    return { ...r, explanation: r.status === "correct" ? item.explanation : null };
  });
  refill(userId);
  return result;
}

export async function acknowledge(userId: string) {
  await mutate(userId, (data) => acknowledgeFailure(data.state));
  return getView(userId);
}

/**
 * Reportar una pregunta defectuosa. Si es la que tienes abierta: se cambia por otra, sin castigo.
 * Si es la que te hizo reiniciar ("impugnar"): una revisión independiente decide; si era defectuosa,
 * se deshace el reinicio. Todo reporte queda registrado para revisar el banco.
 */
export async function reportItem(userId: string, input: { itemId: string; reason: string; contest: boolean }) {
  const snapshot = await read(userId);
  const item = snapshot.items[input.itemId];
  if (!item) return { message: "No encontré esa pregunta." };
  await mkdir(DIR, { recursive: true });
  await appendFile(join(DIR, "reports.jsonl"), JSON.stringify({ at: new Date().toISOString(), itemId: item.id, reason: input.reason.slice(0, 300), contest: input.contest }) + "\n");

  let verdict: { defective: boolean; reason: string } | null = null;
  const failure = snapshot.state.failure;
  if (input.contest && failure && !failure.acknowledged && failure.itemId === item.id) {
    verdict = await contestItem(item, failure.choice).catch(() => null);
  }
  const message = await mutate(userId, (data) => {
    const it = data.items[input.itemId];
    if (it) it.status = "reported";
    const r = data.state.round;
    const current = r.slots[r.position];
    if (!input.contest && current?.itemId === input.itemId && current.state !== "correct") {
      // La pregunta abierta: se retira y se repone otra en el mismo sitio. No cuenta como error.
      Object.assign(current, { itemId: null, state: "pending", presentedAt: undefined, fresh: undefined });
      return "Gracias. Retiré esa pregunta y te pongo otra, sin castigo.";
    }
    if (verdict?.defective && data.state.failure?.itemId === input.itemId) {
      undoFailure(data.state, Date.now());
      return `Tenías razón: la pregunta era defectuosa (${verdict.reason}). Deshice el reinicio.`;
    }
    if (input.contest) return verdict ? `La revisión dice que la pregunta es correcta: ${verdict.reason}` : "No pude revisarla ahora; quedó reportada.";
    return "Gracias, quedó reportada para revisión.";
  });
  refill(userId);
  return { message, view: await getView(userId) };
}

export const familyLabel = (id: number) => FAMILY_BY_ID.get(id)?.label ?? "";
