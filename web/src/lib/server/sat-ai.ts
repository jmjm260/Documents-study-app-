// IA del entrenamiento SAT (solo servidor). Trabajos SEPARADOS (quien escribe no se revisa a sí mismo):
//   1) generar preguntas originales;
//   2) revisarlas resolviéndolas SIN ver la clave + estimar su dificultad A CIEGAS (sin saber el nivel pretendido)
//      frente a las referencias oficiales;
//   3) escribir microlecciones; 4) revisarlas; 5) auditar una pregunta impugnada.
// Las revisiones reducen errores, pero no son infalibles: por eso existen "Reportar" e "Impugnar".
// Todo pasa por la interfaz SatAi para que las pruebas puedan usar una IA falsa.
import { randomUUID } from "node:crypto";
import { askOnceWithUsage, type AskUsage } from "../ai/ask-once";
import { getProvider } from "../ai/providers";
import { ADVANCED_MIN_DIFFICULTY } from "../sat/config";
import { DIFFICULTY_RUBRIC, FAMILY_BY_ID, MICRO_BY_ID } from "../sat/curriculum";
import { fingerprint, OPTION_IDS, standardWords, validateItem, type OptionId, type SatItem } from "../sat/items";
import { checkLesson } from "../sat/lessons";
import { anchorsFor, bandAccepted, BANDS, DIMENSIONS, expectedBand, OFFICIAL_SPECS, type Band } from "../sat/references";

export type Meter = (u: AskUsage) => void;

export interface SatAi {
  generateBatch(opts: { micro: string; difficulty: number; count: number; avoid: string[] }, meter: Meter): Promise<{ items: SatItem[]; rejected: string[] }>;
  reviewItems(items: SatItem[], meter: Meter): Promise<{ ok: SatItem[]; rejected: string[] }>;
  generateLesson(micro: string, difficulty: number, feedback: string[], meter: Meter): Promise<{ title: string; body: string } | null>;
  reviewLesson(lesson: { title: string; body: string }, micro: string, meter: Meter): Promise<{ ok: boolean; issues: string[] }>;
  contestItem(item: SatItem, choice: OptionId | null, meter: Meter): Promise<{ defective: boolean; reason: string }>;
}

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
- Passage length like the real SAT: ${OFFICIAL_SPECS.passageStdWords[0]}–${OFFICIAL_SPECS.passageStdWords[1]} standardized words (characters/6) for difficulty 3+; difficulty 1–2 may be shorter.
- Rhetorical Synthesis: passage = "While researching a topic, a student has taken the following notes:" plus bullet notes (•).
- Quantitative evidence: include "chart" with structured data {"kind":"bar"|"line"|"table","title","xLabel","yLabel","unit","categories":[…],"series":[{"name","values":[numbers]}],"note"}.
  Values must be exact and must agree with the passage and the correct answer. No calculation needed. Otherwise "chart": null.
- Cross-Text: put Text 1 in "passage" and Text 2 in "passage2".
- Only the skill requested; enough information inside the passage (no outside knowledge); no trick ambiguity; no needlessly obscure words.
  Higher difficulty comes from syntax, more information to integrate, less direct (but sufficient) evidence, precise academic vocabulary,
  and distractors that differ in scope or nuance — never from ambiguity or length.
- Distractors must be plausible and wrong for a concrete reason (exaggerate, reverse a relation, mix voices, add information,
  partially correct, wrong punctuation/grammar). "distractors" gives the reason for EACH wrong letter.
- "verification": the rule, the textual evidence or the calculation that proves the key.
- Vary topics (literature, history, social science, natural science, humanities) and the position of the correct letter.`;

const REVIEW_SYSTEM = `You are an independent reviewer of SAT Reading and Writing practice items. You do NOT see the answer key
and you do NOT know the difficulty the writer intended. For each item:
1) Solve it carefully. 2) Judge its quality strictly. 3) Estimate its difficulty BLINDLY against the official anchors given.

Return ONLY valid JSON (no \`\`\`):
{"reviews":[{"index":0,"answer":"A"|"B"|"C"|"D","confidence":"high"|"medium"|"low","ambiguous":true|false,
"sufficient":true|false,"english_ok":true|false,"on_skill":true|false,"issues":["…"],
"band":"fundamentos"|"easy"|"medium"|"hard"|"above",
"dims":{${DIMENSIONS.map((d) => `"${d}":1|2|3`).join(",")}},
"band_reasons":"…"}]}

- "ambiguous": more than one choice could reasonably be defended, or none is clearly correct.
- "sufficient": the passage (and data) contain everything needed (no outside knowledge).
- "english_ok": grammatical, natural English (except the deliberate error being tested).
- "on_skill": really tests the NAMED skill. The official anchors are only illustrative examples of length and difficulty
  for that family: an item does NOT have to copy their specific pattern (e.g. a cause/effect transition item is on-skill
  for Transitions even if the anchor shows a concession).
- "issues": concrete DEFECTS only (factual or grammatical errors outside the tested point, ambiguity, missing information,
  wrong skill, misleading data). Empty if none. When in doubt about a defect, report it.
  Being shorter, simpler or easier than the official samples is NOT a defect: some items are deliberately at a teaching
  level below the SAT. Express ease/difficulty ONLY through "band" and "dims", never in "issues".
- "band": compare with the official anchors: "fundamentos" = simpler than an easy SAT question (teaching level);
  "easy"/"medium"/"hard" = like SAT questions of that level; "above" = harder than typical hard SAT but still clear and fair.
  Difficulty from ambiguity, outside knowledge or obscure vocabulary does NOT count as higher difficulty: report it as an issue.
- "dims": 1 = low, 2 = medium, 3 = high demand on each dimension. "band_reasons": one or two sentences.`;

const LESSON_SYSTEM = `Eres Tocorito, tutor (un tocororo cubano con gafas y café), estilo SoloLearn: explicaciones pequeñas y claras.
Escribes UNA microexplicación para el SAT Reading and Writing, en español claro y correcto, con ejemplos en inglés.

Responde SOLO con JSON válido (sin \`\`\`): {"titulo":"…","explicacion":"…"}
- "explicacion" en Markdown sencillo: 40–100 palabras (orientativo). Una sola regla o idea manejable, con sus condiciones.
- Enuncia la regla de forma PRECISA (p. ej. "verbo conjugado/finito", no "la acción"; "concuerda en número con el sujeto")
  y di qué hacer con ella. Si tiene excepciones importantes, menciónalas en pocas palabras; no la presentes como universal.
- Incluye un ejemplo breve en inglés (en \`código\` o **negrita**) y, si ayuda, la trampa más frecuente ("Trampa: …").
- Solo el microobjetivo indicado: no intentes cubrir todo el tema (otros aspectos tienen su propia lección).
- Puedes usar una tablita Markdown de 2–4 filas o una lista corta si aclara. Nada de bloques enormes de teoría.
- NO resuelvas ninguna pregunta concreta. Revisa ortografía. Tono amable con un pique corto de Tocorito como mucho.`;

const LESSON_REVIEW_SYSTEM = `Eres un revisor experto, independiente del autor, de microlecciones de SAT Reading and Writing
(explicación en español, ejemplos en inglés). Sé estricto. Comprueba:
1) Exactitud de la regla y de sus condiciones. 2) Ejemplos en inglés correctos. 3) Español correcto: sin erratas, letras repetidas,
problemas de codificación ni frases mal construidas. 4) Que corresponda al microobjetivo indicado y sus prerrequisitos.
5) Breve y clara. 6) Que no presente como universal una simplificación con excepciones importantes. 7) Que no resuelva una pregunta concreta.
Alcance: juzga SOLO frente al microobjetivo indicado. Es una microlección de 40–100 palabras: NO es un defecto que no cubra
otros aspectos del tema (tienen su propia lección) ni que omita casos poco frecuentes. Las preferencias de estilo tampoco son defectos.
Sí lo son: reglas inexactas o engañosas, ejemplos incorrectos, erratas, frases confusas o mal construidas, fuera del microobjetivo.
Responde SOLO JSON: {"ok":true|false,"issues":["problema concreto en español"]}. ok=true solo si no hay ningún defecto.`;

const CONTEST_SYSTEM = `You are a strict SAT item auditor. A student answered a practice item and was marked wrong.
Decide if the ITEM is defective: the key is wrong, the student's choice is equally defensible, the item is ambiguous,
or it lacks information. Judge only the item itself; there is no other input. Return ONLY JSON:
{"defective":true|false,"reason":"short reason in Spanish"}. Only say defective if you are confident; a hard but fair item is NOT defective.`;

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

/** Longitud del pasaje como en el SAT (25–150 palabras estandarizadas); los fundamentos (1–2) pueden ser más cortos. */
export function lengthIssue(item: Pick<SatItem, "passage" | "passage2" | "difficulty">): string | null {
  const w = standardWords(item.passage, item.passage2);
  const [min, max] = OFFICIAL_SPECS.passageStdWords;
  if (w > max) return `pasaje demasiado largo (${w} palabras estándar)`;
  if (item.difficulty >= 3 && w < min) return `pasaje demasiado corto para su nivel (${w} palabras estándar)`;
  return null;
}

export function createRealAi(): SatAi {
  const ask = async (system: string, prompt: string, level: "medium" | "high", meter: Meter) => {
    const { text, usage } = await askOnceWithUsage(getProvider(), { system, prompt, level });
    meter(usage);
    return text;
  };

  return {
    async generateBatch(opts, meter) {
      const micro = MICRO_BY_ID.get(opts.micro)!;
      const family = FAMILY_BY_ID.get(micro.family)!;
      const prompt = `Write ${opts.count} different items.
Family ${family.id}: ${family.name}.
Skill (micro-objective ${micro.id}): ${micro.title}.
Difficulty ${opts.difficulty}/8: ${DIFFICULTY_RUBRIC[opts.difficulty]}
${opts.avoid.length ? `Do NOT reuse these topics or passages (the student already saw them):\n- ${opts.avoid.slice(-15).join("\n- ")}\n` : ""}
Each item: "family": ${family.id}, "micros" starts with "${micro.id}", "difficulty": ${opts.difficulty}.`;
      const list = (json(await ask(GEN_SYSTEM, prompt, "medium", meter))?.items as unknown[]) ?? [];
      const items: SatItem[] = [];
      const rejected: string[] = [];
      for (const r of list) {
        const v = validateItem(r, { family: family.id, micro: micro.id, difficulty: opts.difficulty });
        if ("error" in v) {
          rejected.push(v.error);
          continue;
        }
        const len = lengthIssue(v.item);
        if (len) {
          rejected.push(len);
          continue;
        }
        const shuffled = shuffleOptions(v.item, Math.random);
        items.push({ ...shuffled, id: randomUUID(), version: 1, fp: fingerprint(shuffled), status: "validated", createdAt: Date.now() });
      }
      if (!list.length) rejected.push("respuesta ilegible");
      return { items, rejected };
    },

    async reviewItems(items, meter) {
      if (!items.length) return { ok: [], rejected: [] };
      const payload = items.map((it, index) => ({
        index,
        skill: `${FAMILY_BY_ID.get(it.family)?.name} — ${MICRO_BY_ID.get(it.micros[0])?.title}`,
        // Anclas oficiales de esa familia. NUNCA el nivel pretendido.
        anchors: anchorsFor(it.family),
        passage: it.passage,
        ...(it.passage2 ? { passage2: it.passage2 } : {}),
        ...(it.chart ? { chart: it.chart } : {}),
        question: it.question,
        choices: Object.fromEntries(it.options.map((o) => [o.id, o.text])),
      }));
      const reviews = (json(await ask(REVIEW_SYSTEM, JSON.stringify({ items: payload }), "high", meter))?.reviews as Record<string, unknown>[]) ?? [];
      const ok: SatItem[] = [];
      const rejected: string[] = [];
      items.forEach((it, i) => {
        const r = reviews.find((x) => Number(x.index) === i);
        if (!r) return void rejected.push("revisión ilegible");
        const issues = Array.isArray(r.issues) ? r.issues.filter(Boolean).map(String) : ["sin revisión"];
        const band = (r.band === "above" ? "por encima" : String(r.band)) as Band;
        const quality =
          String(r.answer).toUpperCase() === it.correct && r.confidence === "high" && r.ambiguous === false && r.sufficient === true && r.english_ok === true && r.on_skill === true && issues.length === 0;
        if (!quality) return void rejected.push(`revisión: ${String(r.answer).toUpperCase() !== it.correct ? "otra respuesta" : issues[0] ?? "dudas de calidad"}`);
        if (!BANDS.includes(band)) return void rejected.push("revisión: banda ilegible");
        const agree = bandAccepted(it.difficulty, band, ADVANCED_MIN_DIFFICULTY);
        it.assessment = {
          band,
          dims: (r.dims as Record<string, number>) ?? {},
          reasons: String(r.band_reasons ?? "").slice(0, 300),
          expected: expectedBand(it.difficulty),
          agree,
          stdWords: standardWords(it.passage, it.passage2),
        };
        if (!agree) return void rejected.push(`dificultad: se buscaba ${expectedBand(it.difficulty)}, la revisión ciega dice ${band}`);
        ok.push(it);
      });
      return { ok, rejected };
    },

    async generateLesson(microId, difficulty, feedback, meter) {
      const micro = MICRO_BY_ID.get(microId)!;
      const family = FAMILY_BY_ID.get(micro.family)!;
      const prereq = micro.prereq.map((p) => MICRO_BY_ID.get(p)?.title).filter(Boolean).join("; ");
      const data = json(
        await ask(
          LESSON_SYSTEM,
          `Familia: ${family.name} (${family.label}).\nMicroobjetivo: ${micro.title}.\n${prereq ? `Ya sabe: ${prereq}.\n` : ""}Nivel: ${DIFFICULTY_RUBRIC[difficulty]}${
            feedback.length ? `\n\nUna versión anterior fue rechazada por: ${feedback.join("; ")}. Corrígelo.` : ""
          }`,
          "medium",
          meter
        )
      );
      const title = typeof data?.titulo === "string" ? data.titulo.trim().slice(0, 100) : "";
      const body = typeof data?.explicacion === "string" ? data.explicacion.trim().slice(0, 1500) : "";
      return title && body ? { title, body } : null;
    },

    async reviewLesson(lesson, microId, meter) {
      // Primero lo automático (barato y determinista); la IA solo si eso pasa.
      const checks = checkLesson(lesson);
      if (checks.length) return { ok: false, issues: checks };
      const micro = MICRO_BY_ID.get(microId)!;
      const prereq = micro.prereq.map((p) => MICRO_BY_ID.get(p)?.title).filter(Boolean).join("; ") || "ninguno";
      const data = json(
        await ask(
          LESSON_REVIEW_SYSTEM,
          `Familia: ${FAMILY_BY_ID.get(micro.family)?.name}. Microobjetivo: ${micro.title}. Prerrequisitos: ${prereq}.\n\nTítulo: ${lesson.title}\n\n${lesson.body}`,
          "high",
          meter
        )
      );
      const issues = Array.isArray(data?.issues) ? data!.issues.map(String).filter(Boolean).slice(0, 5) : ["revisión ilegible"];
      return { ok: data?.ok === true && issues.length === 0, issues };
    },

    async contestItem(item, choice, meter) {
      // Solo la pregunta, su clave y la opción elegida. El texto del reporte NO se pasa (no es una instrucción).
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
      const data = json(await ask(CONTEST_SYSTEM, prompt, "high", meter));
      return { defective: data?.defective === true, reason: typeof data?.reason === "string" ? data.reason.slice(0, 300) : "" };
    },
  };
}
