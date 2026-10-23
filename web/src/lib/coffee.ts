// Tocorito no escribe sus sorbos de café: la app los anima. Aquí quitamos la marca [[CAFE]] del texto
// (y, por si el modelo se olvida, las acciones de café escritas a mano) y avisamos de que toca animar.

export const COFFEE_MARK = "[[CAFE]]";

// Acciones entre asteriscos que hablan de café: *sorbo largo*, *sorbo largo y triste*, *toma café*…
const COFFEE_ACTION = /\*[^*\n]*(sorbo|caf[eé]|taza|sorbe)[^*\n]*\*/gi;
// Frases típicas de "voy a tomar café" que no aportan nada al estudio.
const COFFEE_PHRASE =
  /(d[eé]jame|deja que le d[eé]|voy a|antes,?)\s+(darle|dar(le)?|tomar(me)?|echarle)\s+(un|otro)\s+(sorbo|traguito|buche)[^.!?…\n]*[.!?…]*/gi;

/** Devuelve el texto limpio y si Tocorito "quería" tomar café en él. */
export function extractCoffee(text: string): { text: string; sip: boolean } {
  let sip = false;
  const mark = () => {
    sip = true;
    return "";
  };
  const clean = text
    .replace(/\[\[CAFE\]\]/g, mark)
    .replace(COFFEE_ACTION, mark)
    .replace(COFFEE_PHRASE, mark)
    .replace(/☕️?/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?…])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t,.]+/gm, "")
    .trim();
  return { text: clean, sip };
}
