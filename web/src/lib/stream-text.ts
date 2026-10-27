// Lo que se enseña MIENTRAS llega la respuesta en streaming: se ocultan los bloques de calendario
// (completos o a medio llegar) y se reparte en burbujas por |||, igual que la versión final.
import { splitReply } from "./chat";
import { extractCoffee } from "./coffee";

export function visibleReplies(raw: string): string[] {
  const text = raw
    .replace(/\[\[(CALENDARIO|QUITAR|FOCUS|REPASO|CURSO)\]\][\s\S]*?(\[\[\/\1\]\]|$)/g, "") // bloques completos o abiertos
    .replace(/\[(\[[A-Z/]*)?$/, "") // inicio de un bloque que aún no se ve entero: "[", "[[", "[[CALEN"…
    .replace(/\s*\|{1,2}\s*$/, "") // separador ||| a medio llegar
    .trimEnd();
  const { text: shown } = extractCoffee(text);
  return shown ? splitReply(shown) : [];
}

/**
 * Mientras se escribe letra a letra, no enseñamos una fórmula a medio cerrar ("$\frac{1"…):
 * cortamos justo antes del último "$" sin pareja. Al terminar se ve completa.
 */
export function typingSafe(text: string): string {
  const cut = (at: number[]) => (at.length % 2 === 1 ? text.slice(0, at[at.length - 1]).trimEnd() : null);
  // Los "$" dentro de código (`$t0`, ```…```, aunque aún no se haya cerrado) no son fórmulas: se tapan.
  const masked = text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*(?:`|$)/g, (m) => " ".repeat(m.length));
  // Primero los bloques $$…$$, luego los $…$ sueltos.
  const blocks = [...masked.matchAll(/(?<!\\)\$\$/g)].map((m) => m.index!);
  const singles = [...masked.matchAll(/(?<![\\$])\$(?!\$)/g)].map((m) => m.index!);
  return cut(blocks) ?? cut(singles) ?? text;
}
