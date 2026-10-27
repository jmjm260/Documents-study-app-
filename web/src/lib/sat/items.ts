// Preguntas del entrenamiento SAT: formato, validación determinista, huellas y detección de duplicados.
// Lógica pura (sin IA ni archivos) para poder probarla. La revisión por IA va aparte (generación ≠ revisión).
import { FAMILIES } from "./curriculum";

export const OPTION_IDS = ["A", "B", "C", "D"] as const;
export type OptionId = (typeof OPTION_IDS)[number];

/** Datos estructurados del gráfico/tabla: la interfaz los dibuja tal cual (nunca una imagen generada). */
export type SatChart = {
  kind: "bar" | "line" | "table";
  title: string;
  xLabel?: string;
  yLabel?: string;
  unit?: string;
  categories: string[];
  series: { name: string; values: number[] }[];
  note?: string;
};

export type Fingerprint = { passage: string; stem: string; options: string; skeleton: string; minhash: number[] };

export type SatItem = {
  id: string;
  version: number;
  lang: "en";
  family: number;
  /** Microobjetivo principal primero; luego los secundarios que también evalúa. */
  micros: string[];
  prereq: string[];
  difficulty: number;
  difficultyWhy: string;
  passage: string;
  /** Segundo texto (conexión entre textos). */
  passage2?: string;
  question: string;
  options: { id: OptionId; text: string }[];
  correct: OptionId;
  /** Explicación en español de por qué la correcta es la mejor. */
  explanation: string;
  /** Razón concreta por la que cada distractor es incorrecto. */
  distractors: Partial<Record<OptionId, string>>;
  /** Regla, evidencia textual o cálculo que permite verificarla. */
  verification: string;
  chart?: SatChart;
  fp: Fingerprint;
  status: "validated" | "reported" | "rejected";
  createdAt: number;
};

/** Lo que recibe el navegador para responder: SIN clave ni explicaciones. */
export type PublicItem = Pick<SatItem, "id" | "family" | "micros" | "difficulty" | "passage" | "passage2" | "question" | "options" | "chart">;

export function publicItem(item: SatItem): PublicItem {
  const { id, family, micros, difficulty, passage, passage2, question, options, chart } = item;
  return { id, family, micros, difficulty, passage, ...(passage2 ? { passage2 } : {}), question, options, ...(chart ? { chart } : {}) };
}

// ---------- Normalización y huellas ----------

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Palabras con mayúscula que NO son nombres propios aunque empiecen oración.
const CAPITAL_STOPWORDS = new Set(
  "the a an in on at this that these those it its he she they we i you when while although though however but and as for of to after before during each every one some many most if because since by with from".split(" ")
);

/** Esqueleto: nombres propios → nname y números → nnum. Así una variante que solo cambia nombres o cifras se detecta. */
export function skeleton(text: string): string {
  return normalize(
    text
      .replace(/\b\d[\d.,]*\b/g, " nnum ")
      .replace(/\b[A-Z][a-z]+\b/g, (w) => (CAPITAL_STOPWORDS.has(w.toLowerCase()) ? w : " nname "))
  );
}

/** Hash FNV-1a de 32 bits (determinista, sin dependencias). */
export function hash(text: string, seed = 0x811c9dc5): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const MINHASH_SEEDS = Array.from({ length: 32 }, (_, i) => (0x9e3779b1 * (i + 1)) >>> 0);

function shingles(text: string): string[] {
  const words = text.split(" ").filter(Boolean);
  if (words.length < 3) return words.length ? [words.join(" ")] : [];
  return Array.from({ length: words.length - 2 }, (_, i) => words.slice(i, i + 3).join(" "));
}

/** MinHash de los trigramas de palabras del esqueleto: estima la similitud entre textos (0–1). */
export function minhash(text: string): number[] {
  const sh = shingles(skeleton(text));
  return MINHASH_SEEDS.map((seed) => (sh.length ? Math.min(...sh.map((s) => parseInt(hash(s, seed), 16))) : 0));
}

export function similarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  return a.filter((v, i) => v === b[i]).length / a.length;
}

export function fingerprint(item: Pick<SatItem, "passage" | "passage2" | "question" | "options">): Fingerprint {
  const body = `${item.passage} ${item.passage2 ?? ""}`;
  const opts = item.options.map((o) => normalize(o.text)).sort().join("|");
  return {
    passage: hash(normalize(body)),
    stem: hash(`${normalize(item.question)}|${opts}`),
    options: hash(opts),
    skeleton: hash(`${skeleton(body)}|${item.options.map((o) => skeleton(o.text)).sort().join("|")}`),
    minhash: minhash(`${body} ${item.question}`),
  };
}

/** Umbral de similitud a partir del cual se considera la "misma" pregunta con cambios superficiales. */
export const SIMILARITY_THRESHOLD = 0.55;

/**
 * ¿Es igual o una variante superficial de algo ya visto/reservado? Compara texto normalizado, esqueleto
 * (nombres y cifras), opciones en cualquier orden y similitud aproximada. No es perfecta: reduce, no elimina.
 */
export function isDuplicate(fp: Fingerprint, others: Fingerprint[]): boolean {
  return others.some(
    (o) =>
      o.passage === fp.passage ||
      o.stem === fp.stem ||
      o.skeleton === fp.skeleton ||
      (o.options === fp.options && similarity(o.minhash, fp.minhash) >= 0.3) ||
      similarity(o.minhash, fp.minhash) >= SIMILARITY_THRESHOLD
  );
}

// ---------- Validación determinista ----------

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Señales de que un texto NO está en inglés (las preguntas evaluativas deben estarlo). */
function looksSpanish(s: string): boolean {
  return /[¿¡ñ]|\b(el|los|las|una|que|para|porque|también)\b/i.test(s) && !/\b(the|and|of|to|is)\b/i.test(s);
}

function validateChart(raw: unknown): SatChart | string {
  const c = raw as Record<string, unknown> | null;
  if (!c) return "falta el gráfico";
  const kind = c.kind;
  if (kind !== "bar" && kind !== "line" && kind !== "table") return "tipo de gráfico no válido";
  const categories = (Array.isArray(c.categories) ? c.categories : []).map((x) => text(x, 40)).filter(Boolean);
  if (categories.length < 2 || categories.length > 12) return "el gráfico necesita 2–12 categorías";
  const series = (Array.isArray(c.series) ? c.series : []).slice(0, 4).map((s: Record<string, unknown>) => ({
    name: text(s?.name, 40),
    values: Array.isArray(s?.values) ? (s.values as unknown[]).map(Number) : [],
  }));
  if (!series.length) return "el gráfico no tiene series";
  for (const s of series) {
    if (!s.name) return "una serie no tiene nombre";
    if (s.values.length !== categories.length) return "los valores no coinciden con las categorías";
    if (s.values.some((v) => !Number.isFinite(v))) return "hay valores que no son números";
  }
  const title = text(c.title, 120);
  if (!title) return "el gráfico no tiene título";
  return {
    kind,
    title,
    ...(text(c.xLabel, 60) ? { xLabel: text(c.xLabel, 60) } : {}),
    ...(text(c.yLabel, 60) ? { yLabel: text(c.yLabel, 60) } : {}),
    ...(text(c.unit, 20) ? { unit: text(c.unit, 20) } : {}),
    categories,
    series,
    ...(text(c.note, 200) ? { note: text(c.note, 200) } : {}),
  };
}

/**
 * Comprueba una pregunta generada ANTES de usarla: estructura, 4 opciones distintas, una sola clave,
 * razones para cada distractor, inglés, pertenencia a la familia/microobjetivo pedido, dificultad y
 * datos del gráfico coherentes. Devuelve la pregunta lista (sin huella aún) o el motivo del rechazo.
 */
export function validateItem(
  raw: unknown,
  expected: { family: number; micro: string; difficulty: number }
): { item: Omit<SatItem, "id" | "fp" | "status" | "createdAt" | "version"> } | { error: string } {
  const r = raw as Record<string, unknown> | null;
  if (!r) return { error: "vacía" };
  const options = (Array.isArray(r.options) ? r.options : []).map((o: Record<string, unknown>, i: number) => ({
    id: OPTION_IDS[i],
    text: text(o?.text ?? o, 300),
  }));
  if (options.length !== 4 || options.some((o) => !o.text)) return { error: "necesita exactamente 4 opciones con texto" };
  if (new Set(options.map((o) => normalize(o.text))).size !== 4) return { error: "hay opciones repetidas" };
  const correct = String(r.correct ?? "").trim().toUpperCase() as OptionId;
  if (!OPTION_IDS.includes(correct)) return { error: "la clave no es A, B, C o D" };

  const passage = text(r.passage, 1600);
  const passage2 = text(r.passage2, 1600);
  const question = text(r.question, 400);
  if (passage.length < 15 || !question) return { error: "falta el texto o el enunciado" };
  if (expected.family === 7 && !passage2) return { error: "conexión entre textos necesita dos textos" };
  if ([passage, passage2, question, ...options.map((o) => o.text)].some((s) => s && looksSpanish(s))) {
    return { error: "el ejercicio debe estar en inglés" };
  }

  const explanation = text(r.explanation, 1200);
  const verification = text(r.verification, 600);
  if (!explanation || !verification) return { error: "falta la explicación o la verificación" };
  const reasons = (r.distractors ?? {}) as Record<string, unknown>;
  const distractors: Partial<Record<OptionId, string>> = {};
  for (const id of OPTION_IDS) {
    if (id === correct) continue;
    const reason = text(reasons[id], 400);
    if (!reason) return { error: `falta la razón del distractor ${id}` };
    distractors[id] = reason;
  }

  const family = Number(r.family);
  if (family !== expected.family) return { error: "no es de la familia pedida" };
  const micros = (Array.isArray(r.micros) ? r.micros : [expected.micro]).map((x) => String(x)).filter((x) => /^F\d{1,2}\.\d{1,2}$/.test(x));
  if (micros[0] !== expected.micro) micros.unshift(expected.micro);
  const difficulty = Number(r.difficulty);
  if (!Number.isInteger(difficulty) || Math.abs(difficulty - expected.difficulty) > 1) return { error: "dificultad fuera de la banda" };

  // Que el enunciado no regale la respuesta.
  const key = normalize(options.find((o) => o.id === correct)!.text);
  if (key.split(" ").length >= 3 && normalize(question).includes(key)) return { error: "el enunciado contiene la respuesta" };

  let chart: SatChart | undefined;
  if (r.chart || expected.family === 10) {
    const c = validateChart(r.chart);
    if (typeof c === "string") return { error: c };
    chart = c;
  }

  return {
    item: {
      lang: "en",
      family,
      micros: [...new Set(micros)].slice(0, 4),
      prereq: (Array.isArray(r.prereq) ? r.prereq : []).map(String).slice(0, 6),
      difficulty: expected.difficulty,
      difficultyWhy: text(r.difficultyWhy, 300),
      passage,
      ...(passage2 ? { passage2 } : {}),
      question,
      options,
      correct,
      explanation,
      distractors,
      verification,
      ...(chart ? { chart } : {}),
    },
  };
}

/** ¿La microlección regala la respuesta de la pregunta que la acompaña? */
export function leaksAnswer(lesson: string, item: Pick<SatItem, "options" | "correct">): boolean {
  const key = normalize(item.options.find((o) => o.id === item.correct)?.text ?? "");
  return key.length >= 8 && key.split(" ").length >= 2 && normalize(lesson).includes(key);
}

export const familyName = (id: number) => FAMILIES.find((f) => f.id === id)?.name ?? "";
