// Unir dos historiales del mismo estudiante (al vincular un dispositivo a su cuenta). Lógica pura.
// Reglas:
// - Preguntas vistas: la UNIÓN (ids y huellas). Nunca se pierde ninguna.
// - Intentos y métricas: se SUMAN (son intentos distintos, hechos en dispositivos distintos); lo "mejor" es el máximo.
//   No hay duplicados: cada historial se une una sola vez (el del dispositivo se borra tras unirse).
// - Progreso activo (nivel, ronda en curso, escalón): se queda el MÁS AVANZADO; el otro se conserva en
//   métricas y eventos. Las preguntas de su ronda que se llegaron a mostrar ya están en "vistas".
import { migrateState, type SatState } from "./engine";

const rank = (s: SatState) => [(s.timeStep ?? -1) + 1, s.level, s.metrics.roundsPassed];

function ahead(a: SatState, b: SatState): boolean {
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i];
  return (a.events.at(-1)?.t ?? 0) >= (b.events.at(-1)?.t ?? 0);
}

const sum = <T extends Record<string | number, number>>(x: T, y: T) => {
  const out = { ...x } as Record<string | number, number>;
  for (const [k, v] of Object.entries(y)) out[k] = (out[k] ?? 0) + v;
  return out as T;
};

export function mergeStates(accountState: SatState, deviceState: SatState): SatState {
  const a = migrateState(structuredClone(accountState));
  const b = migrateState(structuredClone(deviceState));
  const winner = ahead(a, b) ? a : b;
  const out: SatState = structuredClone(winner);

  const ids = new Set(a.seen.ids);
  out.seen = { ids: [...a.seen.ids], fps: [...a.seen.fps] };
  const fpKeys = new Set(a.seen.fps.map((f) => `${f.passage}|${f.stem}`));
  for (const id of b.seen.ids) {
    if (ids.has(id)) continue;
    ids.add(id);
    out.seen.ids.push(id);
  }
  for (const f of b.seen.fps) {
    const key = `${f.passage}|${f.stem}`;
    if (fpKeys.has(key)) continue;
    fpKeys.add(key);
    out.seen.fps.push(f);
  }

  out.stats = {};
  for (const src of [a, b]) for (const [m, s] of Object.entries(src.stats)) {
    const t = (out.stats[m] ??= { attempts: 0, correct: 0 });
    t.attempts += s.attempts;
    t.correct += s.correct;
  }
  out.familyStats = {};
  for (const src of [a, b]) for (const [f, s] of Object.entries(src.familyStats)) {
    const t = (out.familyStats[Number(f)] ??= { attempts: 0, correct: 0, totalMs: 0 });
    t.attempts += s.attempts;
    t.correct += s.correct;
    t.totalMs += s.totalMs;
  }
  out.micro = {};
  for (const src of [a, b]) for (const [m, p] of Object.entries(src.micro)) {
    const t = (out.micro[m] ??= { answered: 0, correct: 0, roundsCorrect: [] });
    t.answered += p.answered;
    t.correct += p.correct;
    t.roundsCorrect = [...new Set([...t.roundsCorrect, ...p.roundsCorrect])].slice(-6);
    if (p.lessonShownAt !== undefined) t.lessonShownAt = Math.min(t.lessonShownAt ?? Infinity, p.lessonShownAt);
    if (p.lessonVersion !== undefined) t.lessonVersion = Math.max(t.lessonVersion ?? 0, p.lessonVersion);
  }

  const ma = a.metrics;
  const mb = b.metrics;
  out.metrics = {
    resets: ma.resets + mb.resets,
    roundsPassed: ma.roundsPassed + mb.roundsPassed,
    answered: ma.answered + mb.answered,
    correct: ma.correct + mb.correct,
    timeouts: ma.timeouts + mb.timeouts,
    wrongByFamily: sum(ma.wrongByFamily, mb.wrongByFamily),
    best: {
      level: Math.max(ma.best.level, mb.best.level),
      timeStep: ma.best.timeStep === null ? mb.best.timeStep : mb.best.timeStep === null ? ma.best.timeStep : Math.max(ma.best.timeStep, mb.best.timeStep),
      roundSize: Math.max(ma.best.roundSize, mb.best.roundSize),
    },
    perfectAtFloor: ma.perfectAtFloor + mb.perfectAtFloor,
    defectsConfirmed: ma.defectsConfirmed + mb.defectsConfirmed,
  };
  out.pendingReviews = [...new Set([...a.pendingReviews, ...b.pendingReviews])];
  out.reports = { ...a.reports, ...b.reports };
  out.processed = { ...a.processed, ...b.processed };
  out.events = [...a.events, ...b.events, { t: Date.now(), type: "merged", detail: `progreso activo del ${winner === a ? "historial de la cuenta" : "dispositivo vinculado"}` }]
    .sort((x, y) => x.t - y.t)
    .slice(-500);
  return out;
}
