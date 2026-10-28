// Servicio del entrenamiento SAT (solo servidor).
// - Estado, preguntas con su CLAVE y reservas viven aquí, en un archivo por "sujeto" (cuenta o dispositivo invitado),
//   en SAT_DATA_DIR (por defecto web/.data/sat; no es una carpeta temporal). Cada cambio: cola en el proceso +
//   candado de archivo entre procesos + escritura atómica. Un doble clic nunca procesa dos veces lo mismo.
// - El navegador solo recibe la pregunta SIN clave; la clave se compara aquí.
// - Búfer: se generan, validan, revisan (a ciegas) y reservan las siguientes preguntas, las fáciles para un posible
//   reinicio y el comienzo de la siguiente ronda. Una ronda cronometrada sin lecciones no empieza sin sus N preguntas.
// - Lecciones: no se muestran sin validar (comprobaciones automáticas + revisión independiente).
// - Reportes: no cambian nada por sí solos; una revisión independiente decide en segundo plano.
// - Presupuesto de IA explícito por día (llamadas); al agotarse se avisa y se espera, sin cronómetro ni fallo.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AskUsage } from "../ai/ask-once";
import { BATCH_SIZE, budget as defaultBudget, LOOKAHEAD, MAX_CONCURRENT_JOBS, RESET_RESERVE, levelInfo } from "../sat/config";
import { FAMILIES, MICRO_BY_ID } from "../sat/curriculum";
import {
  acceptRestore,
  acknowledgeFailure,
  answer,
  applyDefect,
  checkTimeout,
  curriculumAudit,
  initialState,
  migrateState,
  remainingMs,
  reveal,
  SatError,
  startRound,
  usedMs,
  type AnswerResult,
  type SatState,
} from "../sat/engine";
import { isDuplicate, leaksAnswer, publicItem, type OptionId, type SatItem } from "../sat/items";
import { lessonKey, type SatLesson } from "../sat/lessons";
import { mergeStates } from "../sat/merge";
import { familiesIn, introsForLevel, planRound, taughtBefore } from "../sat/planner";
import { referenceCoverage } from "../sat/references";
import { renameWithRetry, withFileLock } from "./file-lock";
import { createRealAi, type SatAi } from "./sat-ai";

const SUBJECT_RE = /^[A-Za-z0-9-]{8,80}$/;
const LESSON_ATTEMPTS = 3;

type GenStats = {
  day: string;
  calls: number;
  inTok: number;
  outTok: number;
  generated: number;
  accepted: number;
  /** Motivos concretos de rechazo y cuántas veces. */
  rejected: Record<string, number>;
  byFamily: Record<number, { generated: number; accepted: number }>;
  shown: number;
  callMs: number[];
};

type UserData = {
  state: SatState;
  /** Preguntas reservadas o ya mostradas a este sujeto (con clave: nunca salen tal cual). */
  items: Record<string, SatItem>;
  /** Preguntas validadas, aún sin asignar ni mostrar (no cuentan como vistas). */
  pool: string[];
  gen: GenStats;
  /** Totales desde siempre (no se reinician cada día). */
  total: { calls: number; generated: number; accepted: number; shown: number };
  /** Reintentos por (microobjetivo|dificultad): espera creciente si un lote no deja nada, con sus motivos. */
  keys: Record<string, { fails: number; nextAt: number; last: string[] }>;
  /** Esperas reales del estudiante (pregunta o lección no lista), en ms. */
  waits: { since: number | null; list: number[] };
  notice: string | null;
  retryAt: number;
};

const today = (now: number) => new Date(now).toISOString().slice(0, 10);
const emptyGen = (day: string): GenStats => ({ day, calls: 0, inTok: 0, outTok: 0, generated: 0, accepted: 0, rejected: {}, byFamily: {}, shown: 0, callMs: [] });

export type ServiceOptions = { dataDir: string; ai: SatAi; now?: () => number; budget?: typeof defaultBudget };

export function createSatService(opts: ServiceOptions) {
  const dir = opts.dataDir;
  const now = opts.now ?? (() => Date.now());
  const budget = opts.budget ?? defaultBudget;
  const ai = opts.ai;

  // ---------- Archivos ----------

  const file = (subject: string) => {
    if (!SUBJECT_RE.test(subject)) throw new Error("sujeto no válido");
    return join(dir, `${subject}.json`);
  };

  async function writeAtomic(target: string, data: unknown) {
    await mkdir(dir, { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(data), "utf8");
    await renameWithRetry(tmp, target);
  }

  function fresh(): UserData {
    const t = now();
    return {
      state: initialState(Math.floor(Math.random() * 2 ** 31), randomUUID()),
      items: {},
      pool: [],
      gen: emptyGen(today(t)),
      total: { calls: 0, generated: 0, accepted: 0, shown: 0 },
      keys: {},
      waits: { since: null, list: [] },
      notice: null,
      retryAt: 0,
    };
  }

  async function read(subject: string): Promise<UserData> {
    let raw: Partial<UserData> & { daily?: { day: string; generated: number } };
    try {
      raw = JSON.parse(await readFile(file(subject), "utf8"));
    } catch {
      return fresh();
    }
    // Datos de la versión anterior: se completan sin perder nada (historial, métricas, búfer).
    const base = fresh();
    const data: UserData = {
      ...base,
      ...raw,
      state: migrateState(raw.state as SatState),
      gen: raw.gen ?? { ...base.gen, generated: raw.daily?.generated ?? 0 },
      total: raw.total ?? { calls: 0, generated: raw.daily?.generated ?? 0, accepted: 0, shown: 0 },
      keys: raw.keys ?? {},
      waits: raw.waits ?? { since: null, list: [] },
    } as UserData;
    delete (data as { daily?: unknown }).daily;
    return data;
  }

  const queues = new Map<string, Promise<unknown>>();

  /** Todo cambio pasa por aquí: cola en el proceso + candado entre procesos; leer → cambiar → guardar (atómico). */
  function mutate<T>(subject: string, fn: (data: UserData) => T | Promise<T>): Promise<T> {
    const run = (queues.get(subject) ?? Promise.resolve()).then(() =>
      withFileLock(file(subject), async () => {
        const data = await read(subject);
        if (data.gen.day !== today(now())) data.gen = emptyGen(today(now()));
        const result = await fn(data);
        pruneItems(data);
        await writeAtomic(file(subject), data);
        return result;
      })
    );
    queues.set(subject, run.catch(() => {}));
    return run;
  }

  /** Las preguntas viejas ya respondidas se pueden olvidar: su huella sigue en el historial de vistas (que nunca se borra). */
  function pruneItems(data: UserData) {
    const keep = new Set([...data.pool, ...(data.state.round.slots.map((s) => s.itemId).filter(Boolean) as string[])]);
    if (data.state.failure?.itemId) keep.add(data.state.failure.itemId);
    for (const id of Object.keys(data.state.reports)) keep.add(id);
    for (const s of data.state.restoreOffer?.round.slots ?? []) if (s.itemId) keep.add(s.itemId);
    const ids = Object.keys(data.items);
    if (ids.length <= 600) return;
    for (const id of ids) if (!keep.has(id) && Object.keys(data.items).length > 500) delete data.items[id];
  }

  // ---------- Lecciones (globales, versionadas, validadas) ----------

  const LESSONS_FILE = join(dir, "lessons.json");

  async function readLessons(): Promise<Record<string, SatLesson>> {
    try {
      const raw = JSON.parse(await readFile(LESSONS_FILE, "utf8")) as Record<string, Partial<SatLesson>>;
      // Las guardadas antes de la revisión no tienen estado: quedan "pendientes" (no se muestran hasta revisarlas).
      return Object.fromEntries(
        Object.entries(raw).map(([k, l]) => {
          const [micro, band] = k.split("|");
          return [k, { micro, band: Number(band), version: 1, status: "pending", ...l } as SatLesson];
        })
      );
    } catch {
      return {};
    }
  }

  async function updateLesson(key: string, fn: (current: SatLesson | undefined) => SatLesson | undefined) {
    await withFileLock(LESSONS_FILE, async () => {
      const map = await readLessons();
      const next = fn(map[key]);
      if (next) map[key] = next;
      await writeAtomic(LESSONS_FILE, map);
    });
  }

  // ---------- Global: presupuesto del servidor y estadísticas por pregunta ----------

  const GLOBAL_FILE = join(dir, "global.json");
  const ITEM_STATS_FILE = join(dir, "item-stats.json");

  async function globalCalls(add = 0): Promise<number> {
    return withFileLock(GLOBAL_FILE, async () => {
      let g = { day: today(now()), calls: 0 };
      try {
        const raw = JSON.parse(await readFile(GLOBAL_FILE, "utf8"));
        if (raw.day === g.day) g = raw;
      } catch {
        /* primero del día */
      }
      g.calls += add;
      if (add) await writeAtomic(GLOBAL_FILE, g);
      return g.calls;
    });
  }

  /**
   * Instrumentación por pregunta (para calibrar más adelante con datos reales): veces mostrada, aciertos,
   * fallos y tiempo. NO se usa para asignar dificultad: un acierto o fallo aislado no prueba nada.
   */
  async function recordItemStat(item: SatItem, ok: boolean, ms: number) {
    await withFileLock(ITEM_STATS_FILE, async () => {
      let all: Record<string, { family: number; micro: string; intended: number; band: string | null; shown: number; correct: number; wrong: number; totalMs: number }> = {};
      try {
        all = JSON.parse(await readFile(ITEM_STATS_FILE, "utf8"));
      } catch {
        /* vacío */
      }
      const s = (all[item.id] ??= { family: item.family, micro: item.micros[0], intended: item.difficulty, band: item.assessment?.band ?? null, shown: 0, correct: 0, wrong: 0, totalMs: 0 });
      s.shown++;
      if (ok) s.correct++;
      else s.wrong++;
      s.totalMs += Math.max(0, ms);
      await writeAtomic(ITEM_STATS_FILE, all);
    });
  }

  // ---------- Asignar preguntas del búfer a la ronda ----------

  /** Posiciones que deben tener pregunta ya: las próximas sin acertar, o TODAS si la ronda cronometrada lo exige. */
  function windowSlots(state: SatState) {
    const r = state.round;
    const open = r.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.state !== "correct");
    if (r.requiresFullReserve) return open;
    const fromPos = open.filter(({ index }) => index >= r.position);
    return [...fromPos, ...open.filter(({ index }) => index < r.position)].slice(0, LOOKAHEAD);
  }

  function assign(data: UserData, lessons: Record<string, SatLesson>) {
    const { state } = data;
    const seen = state.seen.fps;
    const noIntros = !state.round.slots.some((s) => s.kind === "intro");
    for (const { slot } of windowSlots(state)) {
      const lesson = slot.kind === "intro" ? lessons[lessonKey(slot.micro, state.round.difficulty)] : undefined;
      // Si la lección (validada) regala la respuesta de su pregunta aún no mostrada, esa pregunta vuelve al búfer.
      if (slot.itemId && slot.state === "pending" && lesson && data.items[slot.itemId] && leaksAnswer(lesson.body, data.items[slot.itemId])) {
        data.pool.push(slot.itemId);
        slot.itemId = null;
        slot.band = undefined;
      }
      if (slot.itemId) continue;
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
      slot.band = data.items[pick].assessment?.band;
    }
  }

  type Need = { micro: string; difficulty: number; count: number };

  /** Qué falta preparar (según existencias): la ronda actual, el comienzo de un reinicio y el de la siguiente ronda. */
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
    // Reinicio: el nivel 1 siempre empieza igual (A1, B1, A2, C1…): sus primeras preguntas fáciles, nuevas, se preparan ya.
    for (const s of planRound({ level: 1, size: levelInfo(1).size, stats: {}, seed: 1 }).slice(0, RESET_RESERVE)) add(s.micro, levelInfo(1).difficulty);
    // Cerca del final de la ronda: el comienzo de la siguiente (o la siguiente ronda de 50 entera, por familias).
    const r = state.round;
    const remaining = r.slots.filter((s) => s.state !== "correct").length;
    if (remaining <= Math.max(LOOKAHEAD, r.size >= 50 ? 25 : 0)) {
      const next = state.level + 1;
      const nextIntros = introsForLevel(next);
      const info = levelInfo(next);
      const difficulty = state.timeStep !== null ? r.difficulty : info.difficulty;
      if (nextIntros.length) nextIntros.slice(0, 3).forEach((m) => add(m, difficulty));
      else for (const f of FAMILIES) for (let i = 0; i < Math.max(1, Math.round(f.weight50 / 2)); i++) add(pickMicro(f.id, next), difficulty);
    }
    const avail = new Map<string, number>();
    for (const id of data.pool) {
      const it = data.items[id];
      if (it) avail.set(`${it.micros[0]}|${it.difficulty}`, (avail.get(`${it.micros[0]}|${it.difficulty}`) ?? 0) + 1);
    }
    return [...want.values()].map((n) => ({ ...n, count: n.count - (avail.get(`${n.micro}|${n.difficulty}`) ?? 0) })).filter((n) => n.count > 0);
  }

  function pickMicro(family: number, level: number): string {
    const taught = [...taughtBefore(level), ...introsForLevel(level)].filter((m) => MICRO_BY_ID.get(m)?.family === family);
    return taught[Math.floor(Math.random() * taught.length)] ?? `F${family}.1`;
  }

  // ---------- Trabajos en segundo plano ----------

  const running = new Map<string, Set<string>>();
  const inflight = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>) => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p));
    return p;
  };

  /** Medidor de uso: cuenta llamadas y tokens en el sujeto y en el total del servidor. */
  const meterFor = (subject: string) => (u: AskUsage) => {
    void track(
      mutate(subject, (d) => {
        d.gen.calls += u.calls;
        d.total.calls += u.calls;
        d.gen.inTok += u.inputTokens;
        d.gen.outTok += u.outputTokens;
        d.gen.callMs = [...d.gen.callMs, u.ms].slice(-60);
      })
    );
    void track(globalCalls(u.calls));
  };

  async function overBudget(data: UserData): Promise<string | null> {
    const b = budget();
    if (data.gen.calls >= b.dailyCalls) return `Se alcanzó el presupuesto de hoy (${b.dailyCalls} llamadas de IA). Puedes repasar lo ya preparado; mañana sigue, o sube SAT_DAILY_CALLS.`;
    if (b.globalDailyCalls !== null && (await globalCalls()) >= b.globalDailyCalls) return "Se alcanzó el presupuesto de IA del servidor por hoy.";
    return null;
  }

  /** Rellena el búfer y valida lecciones (no bloquea al estudiante). Se llama tras cada acción. */
  function refill(subject: string) {
    void track(
      (async () => {
        const lessons = await readLessons();
        const plan = await mutate(subject, async (data) => {
          assign(data, lessons);
          const limit = await overBudget(data);
          data.notice = limit ?? (now() < data.retryAt ? data.notice : null);
          const lessonNeeds = windowSlots(data.state)
            .filter(({ slot }) => slot.kind === "intro")
            .map(({ slot }) => ({ micro: slot.micro, difficulty: data.state.round.difficulty }))
            .filter((l) => lessons[lessonKey(l.micro, l.difficulty)]?.status !== "validated");
          const needs = computeNeeds(data).filter((n) => (data.keys[`${n.micro}|${n.difficulty}`]?.nextAt ?? 0) <= now());
          return { needs, lessonNeeds, blocked: Boolean(limit) || now() < data.retryAt };
        });
        if (plan.blocked) return;
        const jobs = running.get(subject) ?? new Set<string>();
        running.set(subject, jobs);
        for (const l of plan.lessonNeeds) {
          const key = `lesson:${lessonKey(l.micro, l.difficulty)}`;
          if (jobs.has(key)) continue;
          jobs.add(key);
          void track(lessonJob(subject, l.micro, l.difficulty).finally(() => jobs.delete(key)));
        }
        for (const n of plan.needs) {
          const key = `items:${n.micro}|${n.difficulty}`;
          if (jobs.has(key) || [...jobs].filter((j) => j.startsWith("items:")).length >= MAX_CONCURRENT_JOBS) continue;
          jobs.add(key);
          void track(
            itemsJob(subject, n).finally(() => {
              jobs.delete(key);
              refill(subject);
            })
          );
        }
      })().catch((err) => console.error("sat: refill falló:", err instanceof Error ? err.message : err))
    );
  }

  /** Lección: si no existe se escribe; si no está validada se revisa; si falla se corrige (hasta 3 veces). */
  async function lessonJob(subject: string, micro: string, difficulty: number) {
    const key = lessonKey(micro, difficulty);
    const meter = meterFor(subject);
    try {
      let current = (await readLessons())[key];
      if (current?.status === "validated") return;
      if (current?.status === "rejected" && current.review && now() - current.review.at < 10 * 60_000) return;
      let feedback: string[] = [];
      for (let attempt = 0; attempt < LESSON_ATTEMPTS; attempt++) {
        if (!current || current.status === "rejected" || feedback.length) {
          const draft = await ai.generateLesson(micro, difficulty, feedback, meter);
          if (!draft) {
            feedback = ["respuesta ilegible"];
            continue;
          }
          current = { ...draft, micro, band: Number(key.split("|")[1]), version: (current?.version ?? 0) + 1, status: "pending" };
        }
        const verdict = await ai.reviewLesson(current, micro, meter);
        const reviewed: SatLesson = {
          ...current,
          status: verdict.ok ? "validated" : "rejected",
          review: { at: now(), checks: verdict.ok ? [] : verdict.issues, ai: verdict.issues, ok: verdict.ok },
        };
        await updateLesson(key, () => reviewed);
        console.info(`sat: lección ${key} v${reviewed.version}: ${verdict.ok ? "validada" : `rechazada (${verdict.issues.join("; ")})`}`);
        if (verdict.ok) return;
        current = reviewed;
        feedback = verdict.issues;
      }
    } catch (err) {
      await technicalProblem(subject, err);
    }
  }

  async function itemsJob(subject: string, need: Need) {
    const key = `${need.micro}|${need.difficulty}`;
    const meter = meterFor(subject);
    try {
      const snapshot = await read(subject);
      // Para no repetir temas: los comienzos de lo ya visto/preparado de esta habilidad.
      const avoid = Object.values(snapshot.items).filter((it) => it.micros[0] === need.micro).map((it) => it.passage.slice(0, 90));
      const { items, rejected: invalid } = await ai.generateBatch({ micro: need.micro, difficulty: need.difficulty, count: Math.min(BATCH_SIZE + 1, need.count + 1), avoid }, meter);
      // Sin duplicados (con lo visto, lo reservado y entre sí) ANTES de gastar en la revisión.
      const others = [...snapshot.state.seen.fps, ...Object.values(snapshot.items).map((it) => it.fp)];
      const unique: SatItem[] = [];
      const dupReasons: string[] = [];
      for (const it of items) {
        if (isDuplicate(it.fp, [...others, ...unique.map((u) => u.fp)])) dupReasons.push("duplicada o paráfrasis de otra");
        else unique.push(it);
      }
      const { ok, rejected } = await ai.reviewItems(unique, meter);
      const reasons = [...invalid, ...dupReasons, ...rejected];
      const family = MICRO_BY_ID.get(need.micro)!.family;
      await mutate(subject, (data) => {
        const generated = items.length + invalid.length;
        data.gen.generated += generated;
        data.total.generated += generated;
        const fam = (data.gen.byFamily[family] ??= { generated: 0, accepted: 0 });
        fam.generated += generated;
        for (const r of reasons) data.gen.rejected[r] = (data.gen.rejected[r] ?? 0) + 1;
        let accepted = 0;
        for (const it of ok) {
          if (isDuplicate(it.fp, [...data.state.seen.fps, ...(data.pool.map((id) => data.items[id]?.fp).filter(Boolean) as SatItem["fp"][])])) continue;
          data.items[it.id] = it;
          data.pool.push(it.id);
          accepted++;
        }
        data.gen.accepted += accepted;
        data.total.accepted += accepted;
        fam.accepted += accepted;
        // Si el lote no dejó nada, se espera cada vez más antes de insistir en esa misma habilidad (con sus motivos).
        const k = (data.keys[key] ??= { fails: 0, nextAt: 0, last: [] });
        if (accepted) data.keys[key] = { fails: 0, nextAt: 0, last: [] };
        else {
          k.fails++;
          k.nextAt = now() + Math.min(30 * 60_000, 20_000 * 2 ** k.fails);
          k.last = reasons.slice(0, 5);
        }
      });
      console.info(`sat: ${key}: ${items.length + invalid.length} generadas, ${ok.length} aprobadas`, reasons);
    } catch (err) {
      await technicalProblem(subject, err);
    }
  }

  /** Un fallo de la IA o de la red NO es un error académico: se avisa y se reintenta más tarde. */
  async function technicalProblem(subject: string, err: unknown) {
    const message = (err as { friendly?: string })?.friendly ?? "Tocorito tuvo un problema técnico preparando contenido. Reintentando…";
    console.error("sat: trabajo falló:", err instanceof Error ? err.message : err);
    await mutate(subject, (data) => {
      data.notice = message;
      data.retryAt = now() + 30_000;
    });
    setTimeout(() => refill(subject), 31_000).unref?.();
  }

  // ---------- Vista pública (lo que ve el navegador) ----------

  function buildView(data: UserData, lessons: Record<string, SatLesson>) {
    const { state } = data;
    const t = now();
    const r = state.round;
    const slot = r.slots[r.position];
    const item = slot?.itemId ? data.items[slot.itemId] : undefined;
    const micro = slot ? MICRO_BY_ID.get(slot.micro) : undefined;
    const revealed = slot?.state === "revealed";
    const lessonRec = slot?.kind === "intro" ? lessons[lessonKey(slot.micro, r.difficulty)] : undefined;
    const lesson = lessonRec?.status === "validated" ? { title: lessonRec.title, body: lessonRec.body, version: lessonRec.version } : null;
    const f = state.failure && !state.failure.acknowledged ? state.failure : null;
    const failedItem = f?.itemId ? data.items[f.itemId] : undefined;
    const b = budget();
    const cost =
      b.priceInPerMTok !== null && b.priceOutPerMTok !== null
        ? { usd: (data.gen.inTok * b.priceInPerMTok + data.gen.outTok * b.priceOutPerMTok) / 1e6, note: null }
        : { usd: null, note: "Coste no calculable: falta configurar SAT_PRICE_IN_PER_MTOK y SAT_PRICE_OUT_PER_MTOK (con Claude local va por tu suscripción)." };
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, x) => a + x, 0) / xs.length) : null);
    return {
      serverNow: t,
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
        usedMs: usedMs(r, t),
        remainingMs: remainingMs(r, t),
        position: r.position,
        answered: r.slots.filter((s) => s.state === "correct").length,
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
            lesson,
            /** Qué falta para poder mostrarla (sin activar el reloj). */
            waitingFor: !item ? "pregunta" : slot.kind === "intro" && !lesson ? "lección" : null,
            ready: Boolean(item) && (slot.kind === "review" || Boolean(lesson)),
            revealed,
            item: revealed && item ? publicItem(item) : null,
            reported: item ? state.reports[item.id]?.status ?? null : null,
          }
        : null,
      failure: f
        ? {
            reason: f.reason,
            level: f.level,
            position: f.position,
            choice: f.choice,
            report: f.itemId ? state.reports[f.itemId] ?? null : null,
            item: failedItem ? { ...publicItem(failedItem), correct: failedItem.correct, explanation: failedItem.explanation, verification: failedItem.verification, distractors: failedItem.distractors } : null,
          }
        : null,
      restoreOffer: state.restoreOffer ? { level: state.restoreOffer.level, position: state.restoreOffer.round.position, size: state.restoreOffer.round.size } : null,
      reports: Object.entries(state.reports)
        .sort((a, b2) => b2[1].at - a[1].at)
        .slice(0, 5)
        .map(([id, x]) => ({ id, ...x })),
      metrics: {
        ...state.metrics,
        seen: state.seen.ids.length,
        families: FAMILIES.map((fam) => ({ id: fam.id, name: fam.name, label: fam.label, ...(state.familyStats[fam.id] ?? { attempts: 0, correct: 0, totalMs: 0 }) })),
        micros: Object.entries(state.stats).map(([id, s]) => ({ id, title: MICRO_BY_ID.get(id)?.title ?? id, family: MICRO_BY_ID.get(id)?.family ?? 0, ...s })),
        audit: curriculumAudit(state),
        pendingReviews: state.pendingReviews,
      },
      generation: {
        today: {
          calls: data.gen.calls,
          inputTokens: data.gen.inTok,
          outputTokens: data.gen.outTok,
          generated: data.gen.generated,
          accepted: data.gen.accepted,
          rejectedTotal: Object.values(data.gen.rejected).reduce((a, x) => a + x, 0),
          rejectedReasons: Object.entries(data.gen.rejected).sort((a, b2) => b2[1] - a[1]).slice(0, 8),
          byFamily: FAMILIES.map((fam) => ({ id: fam.id, ...(data.gen.byFamily[fam.id] ?? { generated: 0, accepted: 0 }) })),
          shown: data.gen.shown,
          avgCallMs: avg(data.gen.callMs),
        },
        total: data.total,
        available: data.pool.length,
        reserved: r.slots.filter((s) => s.itemId && s.state === "pending").length,
        waits: { count: data.waits.list.length, avgMs: avg(data.waits.list), maxMs: data.waits.list.length ? Math.max(...data.waits.list) : null },
        budget: { dailyCalls: b.dailyCalls, used: data.gen.calls, globalDailyCalls: b.globalDailyCalls },
        cost,
      },
      references: referenceCoverage(),
    };
  }

  // ---------- Acciones ----------

  async function view(subject: string) {
    const lessons = await readLessons();
    const v = await mutate(subject, (data) => {
      checkTimeout(data.state, now());
      assign(data, lessons);
      const built = buildView(data, lessons);
      // Medir esperas reales: desde que algo no está listo hasta que lo está.
      const waiting = Boolean(built.slide && !built.slide.ready && !built.failure && built.round.started);
      if (waiting && data.waits.since === null) data.waits.since = now();
      if (!waiting && data.waits.since !== null) {
        data.waits.list = [...data.waits.list, now() - data.waits.since].slice(-100);
        data.waits.since = null;
      }
      return built;
    });
    refill(subject);
    return v;
  }

  async function start(subject: string, roundId: string) {
    await mutate(subject, (data) => startRound(data.state, roundId));
    return view(subject);
  }

  /** Muestra la pregunta actual. Antes vuelve a comprobar que sea nueva (por si otra pestaña/dispositivo la mostró). */
  async function revealQuestion(subject: string, roundId: string, position: number) {
    const lessons = await readLessons();
    await mutate(subject, (data) => {
      const slot = data.state.round.slots[position];
      const item = slot?.itemId ? data.items[slot.itemId] : undefined;
      if (slot?.state === "pending" && item && (isDuplicate(item.fp, data.state.seen.fps) || item.status !== "validated")) {
        // Repetida o retirada: se cambia por otra (sin castigo y sin activar el reloj).
        if (item.status === "validated") item.status = "rejected";
        slot.itemId = null;
        slot.band = undefined;
        return;
      }
      // Un concepto nuevo solo se evalúa si su lección VALIDADA está ahí.
      const lesson = slot?.kind === "intro" ? lessons[lessonKey(slot.micro, data.state.round.difficulty)] : undefined;
      if (slot?.kind === "intro" && lesson?.status !== "validated") throw new SatError("not_ready", "La lección aún se está revisando.");
      const wasPending = slot?.state === "pending";
      reveal(data.state, roundId, position, now(), item?.fp ?? null, true, lesson?.version);
      if (wasPending && item) {
        data.gen.shown++;
        data.total.shown++;
      }
    });
    return view(subject);
  }

  async function submitAnswer(subject: string, input: { roundId: string; position: number; choice: OptionId; nonce: string }) {
    let stat: { item: SatItem; ok: boolean; ms: number } | null = null;
    const result = await mutate(subject, (data): AnswerResult & { explanation: string | null } => {
      const done = data.state.processed[input.nonce];
      if (done) return { ...done, explanation: null };
      const slot = data.state.round.slots[input.position];
      const item = slot?.itemId ? data.items[slot.itemId] : undefined;
      if (!item) throw new SatError("not_ready", "La pregunta no está disponible.");
      const presentedAt = slot.presentedAt;
      const r = answer(data.state, input, item.correct, now());
      if (presentedAt != null && r.status !== "timeout") stat = { item, ok: r.status === "correct", ms: now() - presentedAt };
      // Justificación breve tras acertar (el detalle completo de un fallo va en la pantalla de reinicio).
      return { ...r, explanation: r.status === "correct" ? item.explanation : null };
    });
    if (stat) void track(recordItemStat((stat as { item: SatItem }).item, (stat as { ok: boolean }).ok, (stat as { ms: number }).ms));
    refill(subject);
    return result;
  }

  async function acknowledge(subject: string) {
    await mutate(subject, (data) => acknowledgeFailure(data.state));
    return view(subject);
  }

  async function restore(subject: string) {
    await mutate(subject, (data) => acceptRestore(data.state, now()));
    return view(subject);
  }

  /**
   * Reportar/impugnar: se REGISTRA y nada más (no pausa, no da acierto, no cambia la pregunta). Una revisión
   * independiente (solo la pregunta y su clave; el texto del reporte NO se le pasa) decide en segundo plano.
   * Si confirma un defecto, se aplican solo sus consecuencias (applyDefect).
   */
  async function report(subject: string, input: { itemId: string; reason: string; contest: boolean }) {
    const accepted = await mutate(subject, (data) => {
      const item = data.items[input.itemId];
      if (!item || !data.state.seen.ids.includes(item.id)) return false;
      if (data.state.reports[item.id]?.status === "pending") return true;
      data.state.reports[item.id] = { at: now(), contest: input.contest, status: "pending" };
      return true;
    });
    if (!accepted) return { message: "Solo se pueden reportar preguntas que ya viste." };
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "reports.jsonl"), JSON.stringify({ at: new Date(now()).toISOString(), itemId: input.itemId, contest: input.contest, reason: input.reason.slice(0, 300) }) + "\n", { flag: "a" });
    void track(reviewReport(subject, input.itemId));
    return {
      message: input.contest
        ? "Pedí una revisión independiente. Mientras tanto el reinicio sigue en pie; si era defectuosa, se anula."
        : "Reportada. La revisión va aparte: el reloj sigue y la pregunta hay que responderla igual. Si era defectuosa, se anula lo que haya causado.",
    };
  }

  async function reviewReport(subject: string, itemId: string) {
    const snapshot = await read(subject);
    const item = snapshot.items[itemId];
    if (!item) return;
    const choice = snapshot.state.failure?.itemId === itemId ? snapshot.state.failure.choice : null;
    let verdict: { defective: boolean; reason: string };
    try {
      verdict = await ai.contestItem(item, choice, meterFor(subject));
    } catch (err) {
      // Error técnico: no hay veredicto (ni consecuencias). Se puede volver a reportar.
      await mutate(subject, (data) => {
        data.state.reports[itemId] = { ...(data.state.reports[itemId] ?? { at: now(), contest: false }), status: "error", detail: "No se pudo revisar ahora (problema técnico)." };
      });
      console.error("sat: revisión de reporte falló:", err instanceof Error ? err.message : err);
      return;
    }
    await mutate(subject, (data) => {
      const rep = data.state.reports[itemId] ?? { at: now(), contest: false, status: "pending" as const };
      if (verdict.defective) {
        const it = data.items[itemId];
        if (it) it.status = "defective";
        // Se aplica sobre el estado ACTUAL (no sobre una copia vieja): no borra intentos posteriores.
        const message = applyDefect(data.state, itemId, now());
        data.state.reports[itemId] = { ...rep, status: "defective", detail: `${message} (${verdict.reason})` };
      } else {
        data.state.reports[itemId] = { ...rep, status: "valid", detail: `La revisión confirma la pregunta: ${verdict.reason}` };
      }
    });
    refill(subject);
  }

  /** Une el historial de `from` en `to` (vinculación de un dispositivo) y borra `from`. Atómico con los dos candados. */
  async function mergeSubjects(from: string, to: string) {
    if (from === to) return;
    await withFileLock(file(from), async () => {
      const src = await read(from);
      await mutate(to, (dst) => {
        const hasDst = dst.state.seen.ids.length > 0 || dst.state.metrics.answered > 0;
        dst.state = hasDst ? mergeStates(dst.state, src.state) : src.state;
        dst.items = { ...src.items, ...dst.items };
        const pool = [...new Set([...dst.pool, ...src.pool])].filter((id) => dst.items[id] && !dst.state.seen.ids.includes(id));
        dst.pool = pool;
        dst.total = {
          calls: dst.total.calls + src.total.calls,
          generated: dst.total.generated + src.total.generated,
          accepted: dst.total.accepted + src.total.accepted,
          shown: dst.total.shown + src.total.shown,
        };
      });
      await rm(file(from), { force: true });
    });
  }

  /** Espera a que terminen los trabajos en segundo plano (para pruebas). */
  async function drain() {
    while (inflight.size) await Promise.allSettled([...inflight]);
  }

  return { view, start, revealQuestion, submitAnswer, acknowledge, restore, report, mergeSubjects, refill, drain, readLessons };
}

export type SatService = ReturnType<typeof createSatService>;
export type SatView = Awaited<ReturnType<SatService["view"]>>;

export const SAT_DATA_DIR = process.env.SAT_DATA_DIR || join(process.cwd(), ".data", "sat");

const g = globalThis as unknown as { __satService?: SatService };
/** Instancia real (IA de verdad, datos en SAT_DATA_DIR). Una por proceso, también con recargas de desarrollo. */
export function satService(): SatService {
  return (g.__satService ??= createSatService({ dataDir: SAT_DATA_DIR, ai: createRealAi() }));
}
