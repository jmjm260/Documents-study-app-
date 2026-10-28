// Registro de referencias OFICIALES para contrastar la dificultad de las preguntas de Tocorito.
//
// Qué es verificable hoy (fuente pública, consultada el 2026-10-26):
// - "Assessment Framework for the Digital SAT Suite" (College Board, PDF): especificaciones y 15 preguntas
//   de muestra de Reading and Writing con dominio, habilidad y clave. Esas muestras NO llevan etiqueta de
//   dificultad ni de banda de complejidad ("merely illustrative", dice el propio marco).
// - La etiqueta oficial de dificultad (easy/medium/hard) solo está en el Student Question Bank, que exige
//   iniciar sesión en College Board: no se pudo consultar. Esas celdas quedan registradas como SIN REFERENCIA.
//
// No se copia texto de preguntas oficiales: solo metadatos y una descripción propia de sus rasgos.
// Los exámenes de práctica oficiales (Bluebook) se reservan para medir después la transferencia; no se usan
// para generar ni para calibrar.

export const FRAMEWORK_URL = "https://satsuite.collegeboard.org/media/pdf/assessment-framework-for-digital-sat-suite.pdf";
export const QUESTION_BANK_URL = "https://satsuite.collegeboard.org/practice/student-question-bank";

/** Especificaciones oficiales de la sección (marco, tablas 8 y 10). */
export const OFFICIAL_SPECS = {
  source: `${FRAMEWORK_URL} (tabla 8, pág. impresa 42–43; tabla 10, pág. 49)`,
  questions: 54,
  operational: 50,
  minutes: 64,
  minutesPerQuestion: 1.19,
  /** Palabras estandarizadas (caracteres ÷ 6) por texto o par de textos. */
  passageStdWords: [25, 150] as const,
  complexityBands: ["grades 6–8", "grades 9–11", "grades 12–14"],
  difficultyLabels: ["easy", "medium", "hard"] as const,
  domainShare: {
    information: "≈26% (12–14)",
    craft: "≈28% (13–15)",
    expression: "≈20% (8–12)",
    conventions: "≈26% (11–15)",
  },
  graphics: "solo tablas, gráficos de barras y de líneas; sin cálculos",
};

export type OfficialDifficulty = (typeof OFFICIAL_SPECS.difficultyLabels)[number];

/** Dimensiones con las que se comparan las preguntas nuevas con las referencias. */
export const DIMENSIONS = [
  "sintaxis y densidad",
  "vocabulario en contexto",
  "relaciones a integrar",
  "claridad/sutileza de la evidencia",
  "plausibilidad de distractores",
  "alcance lógico de la conclusión",
  "complejidad de datos",
  "tiempo razonable",
] as const;

export type Reference = {
  id: string;
  source: string;
  /** Identificador oficial cuando existe (las muestras del marco no tienen). */
  officialId: string | null;
  family: number;
  /** Etiqueta oficial de dificultad; null = el material no la publica. */
  officialDifficulty: OfficialDifficulty | null;
  complexityBand: string | null;
  /** Aproximado (incluye texto, sin enunciado ni opciones salvo cuando las opciones son citas). */
  stdWordsApprox: number;
  /** Rasgos que justifican la comparación (descripción propia, no texto oficial). */
  features: string;
};

const fw = (page: number, printed: number) => `Assessment Framework for the Digital SAT Suite, pág. impresa ${printed} (PDF ${page})`;

export const REFERENCES: Reference[] = [
  { id: "FW-061", source: fw(61, 52), officialId: null, family: 8, officialDifficulty: null, complexityBand: null, stdWordsApprox: 100,
    features: "Párrafo informativo sobre el método de una artista; idea central repartida en varias oraciones con ejemplo; evidencia explícita; distractores que afirman cosas no dichas (aclamación, dificultad) o contradicen un ejemplo." },
  { id: "FW-062", source: fw(62, 53), officialId: null, family: 9, officialDifficulty: null, complexityBand: null, stdWordsApprox: 104,
    features: "Hipótesis científica + diseño experimental con modelos; elegir el hallazgo que la apoyaría: hay que conectar un rasgo de la hipótesis (presas con movimientos rápidos) con una medida (girar rápido); distractores que la contradicen o medidas sin relación." },
  { id: "FW-063", source: fw(63, 54), officialId: null, family: 9, officialDifficulty: null, complexityBand: null, stdWordsApprox: 51,
    features: "Afirmación de dos partes sobre un poema de principios del s. XX; opciones son estrofas con léxico literario antiguo; la clave cubre AMBAS partes; los distractores solo una o un tono distinto." },
  { id: "FW-064", source: fw(64, 55), officialId: null, family: 10, officialDifficulty: null, complexityBand: null, stdWordsApprox: 149,
    features: "Tabla de 5 categorías × 3 columnas de porcentajes + texto que pide un ejemplo de variación amplia; sin cálculos; distractores con una sola categoría o valores iguales (no ilustran la afirmación)." },
  { id: "FW-065", source: fw(65, 56), officialId: null, family: 11, officialDifficulty: null, complexityBand: null, stdWordsApprox: 110,
    features: "Texto argumentativo de ciencia con estructura concesiva (beneficios conocidos vs. vulnerabilidad); completar la implicación; hay que integrar 3 premisas; distractores que generalizan a 'muchos/la mayoría de rasgos' (alcance excesivo)." },
  { id: "FW-067", source: fw(67, 58), officialId: null, family: 5, officialDifficulty: null, complexityBand: null, stdWordsApprox: 67,
    features: "Espacio con pista definitoria explícita más adelante en la misma oración (cualidad musical agradable); vocabulario común; distractor opuesto y dos sin relación." },
  { id: "FW-068", source: fw(68, 59), officialId: null, family: 5, officialDifficulty: null, complexityBand: null, stdWordsApprox: 116,
    features: "Fragmento de novela de 1925 con sintaxis literaria (incisos con raya); significado de una palabra polisémica; distractores con otras acepciones reales de la palabra." },
  { id: "FW-069", source: fw(69, 60), officialId: null, family: 5, officialDifficulty: null, complexityBand: null, stdWordsApprox: 74,
    features: "Espacio con vocabulario académico de nivel alto en las opciones; la pista está en la oración siguiente (varias disciplinas); distractores con matiz opuesto o sin sentido." },
  { id: "FW-070", source: fw(70, 61), officialId: null, family: 6, officialDifficulty: null, complexityBand: null, stdWordsApprox: 131,
    features: "Párrafo argumentativo: afirmación cautelosa + estudio como 'caso ilustrativo' + resultado inesperado; propósito principal; distractores que atribuyen otra función (criticar métodos, malentendidos, resolver un problema)." },
  { id: "FW-071", source: fw(71, 62), officialId: null, family: 6, officialDifficulty: null, complexityBand: null, stdWordsApprox: 168,
    features: "Descripción literaria del s. XIX con fragmentos y lenguaje figurado; función de una oración subrayada en el conjunto; distractores sobre contraste, elaboración o ambientación." },
  { id: "FW-072", source: fw(72, 63), officialId: null, family: 7, officialDifficulty: null, complexityBand: null, stdWordsApprox: 178,
    features: "Par de textos: teoría (Texto 1) y experimento con resultado contrario a lo esperado (Texto 2); cómo verían los autores del 2 la teoría del 1; distractores de acuerdo parcial o condicionado." },
  { id: "FW-074", source: fw(74, 65), officialId: null, family: 4, officialDifficulty: null, complexityBand: null, stdWordsApprox: 104,
    features: "Cinco notas sobre un artista; objetivo: resaltar una semejanza entre dos obras; la clave usa 'both/like'; distractores: contraste con 'however', idea general sin las obras, datos sin relación lógica." },
  { id: "FW-075", source: fw(75, 66), officialId: null, family: 3, officialDifficulty: null, complexityBand: null, stdWordsApprox: 110,
    features: "Dos oraciones; la segunda matiza (concesión) la primera, reforzada por 'even'; la clave es 'though'; distractores de énfasis, consecuencia y adición." },
  { id: "FW-076", source: fw(76, 67), officialId: null, family: 1, officialDifficulty: null, complexityBand: null, stdWordsApprox: 90,
    features: "Sujeto muy largo con cláusula y frase de tiempo antes del verbo 'is'; no lleva puntuación; distractores con coma, dos puntos y punto y coma entre sujeto y verbo." },
  { id: "FW-077", source: fw(77, 68), officialId: null, family: 2, officialDifficulty: null, complexityBand: null, stdWordsApprox: 77,
    features: "Frase participial introductoria que debe ir seguida del sustantivo que modifica (modificador colgante); opciones con estructuras de oración distintas y nombres propios con diacríticos." },
];

/** Matriz familia × dificultad oficial: qué celdas tienen referencia etiquetada y cuáles no. */
export function referenceCoverage(): { family: number; skillRefs: number; byDifficulty: Record<OfficialDifficulty, number>; note: string }[] {
  return Array.from({ length: 11 }, (_, i) => {
    const family = i + 1;
    const refs = REFERENCES.filter((r) => r.family === family);
    const byDifficulty = { easy: 0, medium: 0, hard: 0 } as Record<OfficialDifficulty, number>;
    for (const r of refs) if (r.officialDifficulty) byDifficulty[r.officialDifficulty]++;
    const missing = OFFICIAL_SPECS.difficultyLabels.filter((d) => !byDifficulty[d]);
    return {
      family,
      skillRefs: refs.length,
      byDifficulty,
      note: missing.length
        ? `Sin referencia oficial etiquetada para: ${missing.join(", ")} (solo en el Student Question Bank, con inicio de sesión).`
        : "Completa",
    };
  });
}

/**
 * Banda esperada para cada dificultad interna de Tocorito, en términos de las etiquetas oficiales.
 * 1–2 son "fundamentos" (por debajo del SAT fácil, para enseñar); 7–8 "por encima" (desafío de Tocorito).
 */
export type Band = "fundamentos" | OfficialDifficulty | "por encima";
export const BANDS: Band[] = ["fundamentos", "easy", "medium", "hard", "por encima"];

export function expectedBand(difficulty: number): Band {
  if (difficulty <= 2) return "fundamentos";
  if (difficulty === 3) return "easy";
  if (difficulty <= 5) return "medium";
  if (difficulty === 6) return "hard";
  return "por encima";
}

/** ¿La banda estimada por la revisión ciega es compatible con la que se buscaba? (±1 banda; avanzada: hard o más). */
export function bandAccepted(difficulty: number, assessed: Band, advancedMin: number): boolean {
  if (difficulty >= advancedMin) return assessed === "hard" || assessed === "por encima";
  return Math.abs(BANDS.indexOf(assessed) - BANDS.indexOf(expectedBand(difficulty))) <= 1;
}

/** Texto de anclaje para el revisor: especificaciones y rasgos de las muestras oficiales de esa familia. */
export function anchorsFor(family: number): string {
  const refs = REFERENCES.filter((r) => r.family === family);
  return `Official SAT specs: passages ${OFFICIAL_SPECS.passageStdWords[0]}–${OFFICIAL_SPECS.passageStdWords[1]} standardized words (characters/6), ${OFFICIAL_SPECS.minutesPerQuestion} min per question, graphics only tables/bar/line without calculation.
Features of official illustrative samples for this skill (NO official difficulty label available):
${refs.map((r) => `- ${r.features}`).join("\n") || "- (none)"}`;
}
