// IA del entrenamiento SAT (solo servidor). Tres trabajos SEPARADOS:
//   1) generar preguntas originales, 2) revisarlas resolviéndolas SIN ver la clave, 3) microlecciones.
// La revisión reduce errores, pero no da una garantía absoluta: por eso existe "Reportar pregunta".
import { askOnce } from "../ai/ask-once";
import { getProvider } from "../ai/providers";
import { DIFFICULTY_RUBRIC, FAMILY_BY_ID, MICRO_BY_ID } from "../sat/curriculum";
import { fingerprint, OPTION_IDS, validateItem, type OptionId, type SatItem } from "../sat/items";
import { randomUUID } from "node:crypto";

const GEN_SYSTEM = `You write ORIGINAL practice items in the style of the Digital SAT Reading and Writing section.
Never copy or paraphrase official College Board questions. Each item: one short passage (or two for Cross-Text),
one question, four answer choices, exactly ONE best answer that is clearly defensible.

Return ONLY valid JSON (no text before or after, no \`\`\`):
{"items":[{"family":N,"micros":["F2.1"],"prereq":[],"difficulty":N,"difficultyWhy":"…","passage":"…","passage2":"…","question":"…",
"options":["…","…","…","…"],"correct":"A","explanation":"…","distractors":{"B":"…","C":"…","D":"…"},"verification":"…","chart":null}]}

Rules:
- passage, passage2, question and options in ENGLISH. explanation, distractors and verification in SPANISH (for a Spanish-speaking student).
- Use real SAT stems, e.g. "Which choice completes the text so that it conforms to the conventions of Standard English?",
  "Which choice completes the text with the most logical transition?", "Which choice most logically completes the text?",
  "Which choice best states the main purpose of the text?", "Based on the texts, how would the author of Text 2 most likely respond to…?",
  "Which choice most effectively uses data from the table to complete the statement?", "The student wants to … Which choice most effectively uses relevant information from the notes to accomplish this goal?"
  For blanks write ______ in the passage.
- Rhetorical Synthesis: passage = "While researching a topic, a student has taken the following notes:" plus bullet notes (•).
- Quantitative evidence: include "chart" with structured data {"kind":"bar"|"line"|"table","title","xLabel","yLabel","unit","categories":[…],"series":[{"name","values":[numbers]}],"note"}.
  Values must be exact and must agree with the passage and the correct answer. Otherwise "chart": null.
- Cross-Text: put Text 1 in "passage" and Text 2 in "passage2".
- Only the skill requested; enough information inside the passage (no outside knowledge); no trick ambiguity; no absurdly long texts.
- Distractors must be plausible and wrong for a concrete reason (exaggerate, reverse a relation, mix voices, add information,
  partially correct, wrong punctuation/grammar). "distractors" gives the reason for EACH wrong letter.
- "verification": the rule, the textual evidence or the calculation that proves the key.
- Vary topics (literature, history, social science, natural science, humanities) and the position of the correct letter.`;

const REVIEW_SYSTEM = `You are an independent reviewer of SAT Reading and Writing practice items. You do NOT see the answer key.
For each item: solve it carefully, then judge its quality strictly.

Return ONLY valid JSON (no \`\`\`):
{"reviews":[{"index":0,"answer":"A"|"B"|"C"|"D","confidence":"high"|"medium"|"low","ambiguous":true|false,
"sufficient":true|false,"english_ok":true|false,"on_skill":true|false,"issues":["…"]}]}

- "ambiguous": true if more than one choice could reasonably be defended, or none is clearly correct.
- "sufficient": the passage (and data) contain everything needed. "english_ok": grammatical, natural English in passage and choices
  (except the deliberate error being tested). "on_skill": the item really tests the named skill (not just mentions it).
- "issues": concrete problems (empty if none). Be strict: when in doubt, report it.`;

const LESSON_SYSTEM = `Eres Tocorito, tutor (un tocororo cubano con gafas y café), estilo SoloLearn: explicaciones pequeñas y claras.
Escribes UNA microexplicación para el SAT Reading and Writing, en español claro, con ejemplos en inglés.

Responde SOLO con JSON válido (sin \`\`\`): {"titulo":"…","explicacion":"…"}
- "explicacion" en Markdown sencillo: 40–100 palabras (orientativo). Una sola regla o idea manejable.
- Incluye un ejemplo breve en inglés (en \`código\` o **negrita**) y, si ayuda, la trampa más frecuente ("Trampa: …").
- Puedes usar una tablita Markdown de 2–4 filas o una lista corta si aclara. Nada de bloques enormes de teoría.
- NO resuelvas ninguna pregunta concreta. Tono amable con un pique corto de Tocorito como mucho.`;

const CONTEST_SYSTEM = `You are a strict SAT item auditor. A student answered a practice item and was marked wrong.
Decide if the ITEM is defective: the key is wrong, the student's choice is equally defensible, the item is ambiguous,
or it lacks information. Return ONLY JSON: {"defective":true|false,"reason":"short reason in Spanish"}.
Only say defective if you are confident; a hard but fair item is NOT defective.`;

function json(raw: string): Record<string, unknown> | null {
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try {
    return JSON.parse(raw.slice(s, e + 1));
  } catch {
    return null;
  }
}

/** Baraja las opciones (los modelos tienden a poner la correcta siempre en la misma letra). */
export function shuffleOptions(item: Omit<SatItem, "id" | "fp" | "status" | "createdAt" | "version">, rand: () => number) {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const oldIds = item.options.map((o) => o.id);
  const options = order.map((from, to) => ({ id: OPTION_IDS[to], text: item.options[from].text }));
  const map = new Map(order.map((from, to) => [oldIds[from], OPTION_IDS[to]]));
  const distractors: Partial<Record<OptionId, string>> = {};
  for (const [id, reason] of Object.entries(item.distractors)) distractors[map.get(id as OptionId)!] = reason;
  // Las explicaciones a veces nombran letras ("la opción B"): se reescriben con la letra nueva.
  const relabel = (s: string) => s.replace(/\b(opci[oó]n|choice|letra)\s+([ABCD])\b/gi, (_, w, l) => `${w} ${map.get(l as OptionId) ?? l}`);
  return {
    ...item,
    options,
    correct: map.get(item.correct)!,
    distractors: Object.fromEntries(Object.entries(distractors).map(([k, v]) => [k, relabel(v!)])) as Partial<Record<OptionId, string>>,
    explanation: relabel(item.explanation),
    verification: relabel(item.verification),
  };
}

/** Genera un lote de preguntas para un microobjetivo y dificultad. Devuelve solo las que pasan la validación estructural. */
export async function generateBatch(opts: { micro: string; difficulty: number; count: number; avoid: string[] }): Promise<{ items: SatItem[]; rejected: string[] }> {
  const micro = MICRO_BY_ID.get(opts.micro)!;
  const family = FAMILY_BY_ID.get(micro.family)!;
  const prompt = `Write ${opts.count} different items.
Family ${family.id}: ${family.name}.
Skill (micro-objective ${micro.id}): ${micro.title}.
Difficulty ${opts.difficulty}/8: ${DIFFICULTY_RUBRIC[opts.difficulty]}
${opts.avoid.length ? `Do NOT reuse these topics or passages (the student already saw them):\n- ${opts.avoid.slice(-15).join("\n- ")}\n` : ""}
Each item: "family": ${family.id}, "micros" starts with "${micro.id}", "difficulty": ${opts.difficulty}.`;
  const raw = await askOnce(getProvider(), { system: GEN_SYSTEM, prompt, level: "medium" });
  const list = (json(raw)?.items as unknown[]) ?? [];
  const items: SatItem[] = [];
  const rejected: string[] = [];
  for (const r of list) {
    const v = validateItem(r, { family: family.id, micro: micro.id, difficulty: opts.difficulty });
    if ("error" in v) {
      rejected.push(v.error);
      continue;
    }
    const shuffled = shuffleOptions(v.item, Math.random);
    items.push({ ...shuffled, id: randomUUID(), version: 1, fp: fingerprint(shuffled), status: "validated", createdAt: Date.now() });
  }
  return { items, rejected };
}

/** Revisión independiente (sin clave). Devuelve las preguntas aprobadas y por qué se rechazaron las demás. */
export async function reviewItems(items: SatItem[]): Promise<{ ok: SatItem[]; rejected: string[] }> {
  if (!items.length) return { ok: [], rejected: [] };
  const payload = items.map((it, index) => {
    const micro = MICRO_BY_ID.get(it.micros[0]);
    return {
      index,
      skill: `${FAMILY_BY_ID.get(it.family)?.name} — ${micro?.title}`,
      passage: it.passage,
      ...(it.passage2 ? { passage2: it.passage2 } : {}),
      ...(it.chart ? { chart: it.chart } : {}),
      question: it.question,
      choices: Object.fromEntries(it.options.map((o) => [o.id, o.text])),
    };
  });
  const raw = await askOnce(getProvider(), { system: REVIEW_SYSTEM, prompt: JSON.stringify({ items: payload }), level: "high" });
  const reviews = (json(raw)?.reviews as Record<string, unknown>[]) ?? [];
  const ok: SatItem[] = [];
  const rejected: string[] = [];
  items.forEach((it, i) => {
    const r = reviews.find((x) => Number(x.index) === i);
    const issues = Array.isArray(r?.issues) ? r.issues.filter(Boolean) : ["sin revisión"];
    const pass =
      r &&
      String(r.answer).toUpperCase() === it.correct &&
      r.confidence === "high" &&
      r.ambiguous === false &&
      r.sufficient === true &&
      r.english_ok === true &&
      r.on_skill === true &&
      issues.length === 0;
    if (pass) ok.push(it);
    else rejected.push(r ? `revisión: ${String(r.answer) !== it.correct ? "otra respuesta" : issues[0] ?? "dudas"}` : "revisión ilegible");
  });
  return { ok, rejected };
}

/** Microlección (se guarda y reutiliza: lo que nunca se repite son las PREGUNTAS). */
export async function generateLesson(microId: string, difficulty: number): Promise<{ title: string; body: string } | null> {
  const micro = MICRO_BY_ID.get(microId)!;
  const family = FAMILY_BY_ID.get(micro.family)!;
  const raw = await askOnce(getProvider(), {
    system: LESSON_SYSTEM,
    prompt: `Familia: ${family.name} (${family.label}).\nMicroobjetivo: ${micro.title}.\nNivel: ${DIFFICULTY_RUBRIC[difficulty]}`,
    level: "medium",
  });
  const data = json(raw);
  const title = typeof data?.titulo === "string" ? data.titulo.trim().slice(0, 100) : "";
  const body = typeof data?.explicacion === "string" ? data.explicacion.trim().slice(0, 1500) : "";
  return title && body.length > 60 ? { title, body } : null;
}

/** El estudiante impugna una pregunta tras fallarla: ¿era defectuosa? */
export async function contestItem(item: SatItem, choice: OptionId | null): Promise<{ defective: boolean; reason: string }> {
  const prompt = JSON.stringify({
    passage: item.passage,
    ...(item.passage2 ? { passage2: item.passage2 } : {}),
    ...(item.chart ? { chart: item.chart } : {}),
    question: item.question,
    choices: Object.fromEntries(item.options.map((o) => [o.id, o.text])),
    key: item.correct,
    student_choice: choice,
    key_explanation: item.verification,
  });
  const data = json(await askOnce(getProvider(), { system: CONTEST_SYSTEM, prompt, level: "high" }));
  return { defective: data?.defective === true, reason: typeof data?.reason === "string" ? data.reason.slice(0, 300) : "" };
}
