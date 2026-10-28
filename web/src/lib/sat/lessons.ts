// Microlecciones del SAT: formato guardado y comprobaciones AUTOMÁTICAS (sin IA).
// La revisión de contenido (exactitud de la regla, ejemplos, excepciones…) la hace después una IA
// separada de la que la escribió (ver lib/server/sat-ai.ts). Ninguna de las dos es infalible.

export type SatLesson = {
  title: string;
  body: string;
  micro: string;
  /** Banda de dificultad para la que se escribió (1 = base, 2 = media, 3 = alta). */
  band: number;
  version: number;
  status: "validated" | "rejected" | "pending";
  review?: { at: number; checks: string[]; ai: string[]; ok: boolean };
};

/** Comprobaciones automáticas: devuelve la lista de problemas (vacía = pasa). */
export function checkLesson(lesson: { title: string; body: string }): string[] {
  const issues: string[] = [];
  const all = `${lesson.title}\n${lesson.body}`;
  // Codificación rota (UTF-8 leído como Windows-1252) o caracteres de reemplazo.
  if (/Ã[\x80-\xBF]|â€|Â[\xA0-\xBF]|�/.test(all)) issues.push("codificación rota");
  // Erratas tipo "sssola": la misma letra 3+ veces seguidas dentro de una palabra.
  const triple = all.match(/\p{L}*(\p{L})\1\1\p{L}*/gu);
  if (triple) issues.push(`letra repetida: ${triple.slice(0, 3).join(", ")}`);
  // Palabra duplicada seguida ("el el", "the the").
  const dup = all.match(/\b(\p{L}{2,})\s+\1\b/giu)?.filter((d) => !/^(that that|had had)$/i.test(d));
  if (dup?.length) issues.push(`palabra repetida: ${dup.slice(0, 2).join(", ")}`);
  // Markdown desparejado: se vería con asteriscos o comillas invertidas sueltas.
  if ((all.match(/\*\*/g) ?? []).length % 2) issues.push("negrita sin cerrar (**)");
  if ((all.match(/`/g) ?? []).length % 2) issues.push("código sin cerrar (`)");
  // Brevedad: orientación 40–100 palabras; se tolera un margen, no bloques enormes ni vacías.
  const words = lesson.body.replace(/[|`*#-]/g, " ").split(/\s+/).filter(Boolean).length;
  if (words < 25) issues.push(`demasiado corta (${words} palabras)`);
  if (words > 160) issues.push(`demasiado larga (${words} palabras)`);
  // Español para explicar y al menos un ejemplo en inglés (en `código`, **negrita** o cursiva).
  if (!/\b(el|la|los|las|una?|que|para|con|del)\b/i.test(lesson.body)) issues.push("no parece estar en español");
  if (!/`[^`]*\b(the|a|is|are|was|were|and|of|to)\b[^`]*`|\*\*[^*]*\b(the|is|are|was|and)\b[^*]*\*\*|_[^_]*\b(the|is|are)\b[^_]*_/i.test(lesson.body)) {
    issues.push("falta un ejemplo en inglés");
  }
  if (lesson.title.length < 4 || lesson.title.length > 90) issues.push("título demasiado corto o largo");
  // No debe "resolver" una pregunta concreta.
  if (/la respuesta (correcta )?es|the (correct )?answer is|opci[oó]n [ABCD]\b/i.test(lesson.body)) issues.push("resuelve una pregunta concreta");
  return issues;
}

export const lessonBand = (difficulty: number) => (difficulty <= 2 ? 1 : difficulty <= 4 ? 2 : 3);
export const lessonKey = (micro: string, difficulty: number) => `${micro}|${lessonBand(difficulty)}`;
