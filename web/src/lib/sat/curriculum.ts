// SAT Reading and Writing: temario de Tocorito.
// Las 4 áreas y 11 familias siguen la especificación oficial del Digital SAT (College Board).
// Los microobjetivos, su orden y prerrequisitos son DECISIÓN DE TOCORITO (guía de implementación),
// no una lista oficial. Ver docs/decisions/0011-sat-reading-writing.md.

export type AreaId = "conventions" | "expression" | "craft" | "information";

export type Family = {
  id: number;
  area: AreaId;
  /** Nombre oficial (inglés). */
  name: string;
  /** Nombre para la interfaz (español). */
  label: string;
  /** Preguntas aproximadas en una ronda de 50 (suma 50: 13 + 10 + 14 + 13). */
  weight50: number;
};

export type Micro = {
  /** Identificador estable: "F<familia>.<n>". */
  id: string;
  family: number;
  /** Qué aprende (español, corto). */
  title: string;
  /** Prerrequisitos (otros microobjetivos). */
  prereq: string[];
  /** Solo base de apoyo: no es un dominio oficial adicional (p. ej. paralelismo). */
  support?: boolean;
};

export const AREAS: Record<AreaId, string> = {
  conventions: "Standard English Conventions",
  expression: "Expression of Ideas",
  craft: "Craft and Structure",
  information: "Information and Ideas",
};

export const FAMILIES: Family[] = [
  { id: 1, area: "conventions", name: "Boundaries", label: "Límites de la oración", weight50: 7 },
  { id: 2, area: "conventions", name: "Form, Structure, and Sense", label: "Forma y concordancia", weight50: 6 },
  { id: 3, area: "expression", name: "Transitions", label: "Transiciones", weight50: 5 },
  { id: 4, area: "expression", name: "Rhetorical Synthesis", label: "Síntesis retórica", weight50: 5 },
  { id: 5, area: "craft", name: "Words in Context", label: "Palabras en contexto", weight50: 6 },
  { id: 6, area: "craft", name: "Text Structure and Purpose", label: "Estructura y propósito", weight50: 4 },
  { id: 7, area: "craft", name: "Cross-Text Connections", label: "Conexión entre textos", weight50: 4 },
  { id: 8, area: "information", name: "Central Ideas and Details", label: "Idea central y detalles", weight50: 3 },
  { id: 9, area: "information", name: "Command of Evidence: Textual", label: "Evidencia textual", weight50: 4 },
  { id: 10, area: "information", name: "Command of Evidence: Quantitative", label: "Evidencia cuantitativa", weight50: 3 },
  { id: 11, area: "information", name: "Inferences", label: "Inferencias", weight50: 3 },
];

const m = (family: number, n: number, title: string, prereq: string[] = [], support = false): Micro => ({
  id: `F${family}.${n}`,
  family,
  title,
  prereq,
  ...(support ? { support } : {}),
});

/** Orden de enseñanza: dentro de cada familia, de lo básico a lo fino. */
export const MICROS: Micro[] = [
  // Familia 1 — Boundaries
  m(1, 1, "Sujeto, verbo principal y cláusula independiente"),
  m(1, 2, "Fragmentos, run-ons y comma splices", ["F1.1"]),
  m(1, 3, "Punto y punto y coma para unir cláusulas", ["F1.2"]),
  m(1, 4, "Coma + conjunción coordinante (FANBOYS)", ["F1.2"]),
  m(1, 5, "Conjunciones subordinantes y adverbios conectores", ["F1.3"]),
  m(1, 6, "Dos puntos tras una cláusula completa", ["F1.3"]),
  m(1, 7, "Rayas, paréntesis e información incidental", ["F1.1"]),
  m(1, 8, "Aposiciones y elementos esenciales vs. no esenciales", ["F1.7"]),
  m(1, 9, "Comas introductorias, listas y listas complejas", ["F1.4"]),
  m(1, 10, "Puntuación con nombres, títulos y aclaraciones", ["F1.8"]),
  m(1, 11, "Cuándo NO va puntuación (la pausa al hablar no decide)", ["F1.9"]),
  // Familia 2 — Form, Structure, and Sense
  m(2, 1, "Concordancia sujeto-verbo (sujeto separado del verbo)"),
  m(2, 2, "Sujetos compuestos y each/every/either/neither", ["F2.1"]),
  m(2, 3, "Concordancia pronombre-antecedente y referencia clara", ["F2.1"]),
  m(2, 4, "Verbos conjugados vs. gerundios, participios e infinitivos", ["F2.1"]),
  m(2, 5, "Tiempos verbales y secuencia temporal", ["F2.4"]),
  m(2, 6, "Modificadores mal colocados o sin referente", ["F2.4"]),
  m(2, 7, "Plurales, posesivos e irregulares", []),
  m(2, 8, "its/it's, their/they're/there, whose/who's", ["F2.7"]),
  m(2, 9, "Base de apoyo: pronombres relativos, paralelismo y comparaciones lógicas", ["F2.3"], true),
  // Familia 3 — Transitions
  m(3, 1, "Elegir la relación lógica antes que la palabra"),
  m(3, 2, "Contraste vs. concesión (however, nevertheless)", ["F3.1"]),
  m(3, 3, "Causa/resultado vs. secuencia (therefore, subsequently)", ["F3.1"]),
  m(3, 4, "Ejemplo, adición y reformulación (for example, furthermore, in other words)", ["F3.1"]),
  m(3, 5, "Semejanza, énfasis y alternativa (similarly, indeed, instead)", ["F3.2"]),
  m(3, 6, "Alcance del conector y coincidencia de palabras engañosa", ["F3.3"]),
  // Familia 4 — Rhetorical Synthesis
  m(4, 1, "Leer el objetivo y elegir notas pertinentes"),
  m(4, 2, "Presentar una persona, obra o investigación", ["F4.1"]),
  m(4, 3, "Expresar semejanza o diferencia", ["F4.1"]),
  m(4, 4, "Describir resultado, proceso o ejemplo de una generalización", ["F4.1"]),
  m(4, 5, "Adaptarse a la familiaridad del lector y destacar relevancia", ["F4.2"]),
  m(4, 6, "Oración verdadera vs. oración que cumple el objetivo", ["F4.3"]),
  // Familia 5 — Words in Context
  m(5, 1, "Completar el espacio con la palabra lógica y precisa"),
  m(5, 2, "Pistas de contraste, ejemplo, definición y consecuencia", ["F5.1"]),
  m(5, 3, "Significados múltiples en contexto", ["F5.1"]),
  m(5, 4, "Matiz, connotación e intensidad", ["F5.2"]),
  m(5, 5, "Términos cercanos (suggest/prove, support/substantiate, qualify/reject)", ["F5.4"]),
  m(5, 6, "Vocabulario académico; raíces y prefijos solo como apoyo", ["F5.3"]),
  // Familia 6 — Text Structure and Purpose
  m(6, 1, "Contenido vs. propósito vs. organización"),
  m(6, 2, "Función de una oración o parte subrayada", ["F6.1"]),
  m(6, 3, "Afirmación/evidencia, problema/solución, observación/interpretación", ["F6.1"]),
  m(6, 4, "Teoría anterior/nueva, opinión/objeción/respuesta", ["F6.3"]),
  m(6, 5, "Aclaraciones, excepciones, limitaciones y cambios de perspectiva", ["F6.2"]),
  // Familia 7 — Cross-Text Connections
  m(7, 1, "Postura de cada autor"),
  m(7, 2, "Acuerdo, desacuerdo y acuerdo parcial", ["F7.1"]),
  m(7, 3, "Cómo respondería un autor al otro", ["F7.2"]),
  m(7, 4, "Diferencias de énfasis, evidencia y supuestos", ["F7.2"]),
  m(7, 5, "No atribuir a un autor ideas del otro", ["F7.3"]),
  // Familia 8 — Central Ideas and Details
  m(8, 1, "Tema vs. idea central"),
  m(8, 2, "Detalles explícitos y paráfrasis", ["F8.1"]),
  m(8, 3, "Referentes (this finding, these results)", ["F8.2"]),
  m(8, 4, "Resúmenes con alcance adecuado y oraciones largas", ["F8.1"]),
  // Familia 9 — Command of Evidence: Textual
  m(9, 1, "Cita que apoya una afirmación"),
  m(9, 2, "Hallazgo que apoya o debilita una hipótesis", ["F9.1"]),
  m(9, 3, "Apoyar TODOS los componentes de la afirmación", ["F9.1"]),
  m(9, 4, "Hipotéticos (\"si fuera cierto\") y por qué fallan los distractores", ["F9.2"]),
  m(9, 5, "Observación, hipótesis, método, resultado y conclusión", ["F9.2"]),
  // Familia 10 — Command of Evidence: Quantitative
  m(10, 1, "Leer tablas y gráficos: título, ejes, leyendas, unidades"),
  m(10, 2, "Comparar categorías, grupos y tendencias", ["F10.1"]),
  m(10, 3, "Mayor valor vs. mayor aumento; cantidades y porcentajes", ["F10.2"]),
  m(10, 4, "Datos que apoyan o contradicen una afirmación; asociación vs. causa", ["F10.2"]),
  m(10, 5, "Integrar texto y gráfico; límites de lo que se puede concluir", ["F10.4"]),
  // Familia 11 — Inferences
  m(11, 1, "Conclusión razonable desde información explícita"),
  m(11, 2, "Integrar varias premisas y completar el texto", ["F11.1"]),
  m(11, 3, "some/most/all y may/likely/must", ["F11.1"]),
  m(11, 4, "Condiciones, excepciones, negaciones y comparaciones", ["F11.2"]),
  m(11, 5, "Respaldado vs. meramente imaginable (sin supuestos externos)", ["F11.3"]),
];

export const MICRO_BY_ID = new Map(MICROS.map((x) => [x.id, x]));
export const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

/**
 * Rúbrica de dificultad (1–8). Sube por estructura, integración de información, evidencia menos directa,
 * vocabulario más preciso y distractores más sutiles; nunca por contenido ajeno al SAT, ambigüedad o
 * textos absurdamente largos. 7–8 son "desafío de Tocorito" (por encima del rango habitual), no oficiales.
 */
export const DIFFICULTY_RUBRIC: Record<number, string> = {
  1: "Fundamentos: oraciones cortas y directas, una sola idea, la pista está explícita y cerca; distractores claramente erróneos.",
  2: "Básico: pasajes de 2–3 oraciones, la evidencia está explícita; un distractor algo plausible.",
  3: "Intermedio bajo: estructuras con una cláusula subordinada, vocabulario común académico, dos distractores plausibles.",
  4: "Intermedio: pasajes de 60–100 palabras, varias ideas que relacionar, evidencia algo menos directa.",
  5: "SAT medio: sintaxis compleja (incisos, aposiciones), vocabulario académico preciso, distractores que difieren en alcance.",
  6: "SAT difícil: integrar varias condiciones o datos, evidencia indirecta pero suficiente, distractores muy plausibles que difieren en matiz.",
  7: "Desafío de Tocorito: como un SAT difícil con más información relevante que integrar y matices más finos; sigue siendo claro y resoluble.",
  8: "Desafío extremo de Tocorito: máxima sutileza en acuerdos, inferencias y datos con varias condiciones; claro, sin trucos ni ambigüedad.",
};
