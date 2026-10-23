// Lo que se enseña MIENTRAS llega la respuesta en streaming: se ocultan los bloques de calendario
// (completos o a medio llegar) y se reparte en burbujas por |||, igual que la versión final.
import { splitReply } from "./chat";

export function visibleReplies(raw: string): string[] {
  const text = raw
    .replace(/\[\[CALENDARIO\]\][\s\S]*?(\[\[\/CALENDARIO\]\]|$)/g, "") // bloques completos o abiertos
    .replace(/\[(\[[A-Z/]*)?$/, "") // inicio de un bloque que aún no se ve entero: "[", "[[", "[[CALEN"…
    .replace(/\s*\|{1,2}\s*$/, "") // separador ||| a medio llegar
    .trimEnd();
  return text.trim() ? splitReply(text) : [];
}
