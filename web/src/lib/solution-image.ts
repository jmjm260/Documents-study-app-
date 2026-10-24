// Imagen limpia de la solución que Tocorito escribió, hecha en el propio dispositivo (gratis, sin IA de imágenes).
// Se dibuja en un <canvas> (funciona igual en Safari/iPhone y al empaquetar con Capacitor):
// las fórmulas LaTeX se pasan a texto con símbolos (x², √, ½…), **negrita** se respeta.

export type Run = { text: string; bold: boolean };

const SYMBOLS: Record<string, string> = {
  cdot: "·", times: "×", div: "÷", pm: "±", mp: "∓", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠",
  approx: "≈", equiv: "≡", infty: "∞", to: "→", rightarrow: "→", Rightarrow: "⇒", leftarrow: "←", implies: "⇒",
  iff: "⇔", degree: "°", circ: "°", angle: "∠", perp: "⊥", parallel: "∥", in: "∈", sum: "Σ", int: "∫", partial: "∂",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ",
  pi: "π", rho: "ρ", sigma: "σ", Sigma: "Σ", tau: "τ", phi: "φ", omega: "ω", Omega: "Ω", ldots: "…", dots: "…",
};
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", x: "ˣ", i: "ⁱ" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎" };

/** Lee un grupo {…} (con llaves anidadas) o un solo carácter, desde la posición i. */
function group(s: string, i: number): [string, number] {
  if (s[i] !== "{") return [s[i] ?? "", i + 1];
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}" && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

const simple = (t: string) => /^[\p{L}\p{N}.,]+$/u.test(t);
const wrap = (t: string) => (simple(t) ? t : `(${t})`);

/** LaTeX sencillo → texto con símbolos. No pretende cubrir todo LaTeX: lo típico de secundaria y universidad. */
export function latexToText(tex: string): string {
  let out = "";
  let i = 0;
  while (i < tex.length) {
    const c = tex[i];
    if (c === "\\") {
      const name = /^[A-Za-z]+/.exec(tex.slice(i + 1))?.[0] ?? "";
      i += 1 + name.length;
      if (!name) {
        // \, \; \! \{ \}  → espacio o el carácter
        const ch = tex[i++] ?? "";
        out += ",;: ".includes(ch) ? " " : ch === "!" ? "" : ch;
      } else if (name === "frac" || name === "dfrac" || name === "tfrac") {
        const [a, j] = group(tex, i);
        const [b, k] = group(tex, j);
        out += `${wrap(latexToText(a))}/${wrap(latexToText(b))}`;
        i = k;
      } else if (name === "sqrt") {
        const [a, j] = group(tex, i);
        out += `√${wrap(latexToText(a))}`;
        i = j;
      } else if (["text", "mathrm", "mathbf", "textbf", "operatorname", "mathit"].includes(name)) {
        const [a, j] = group(tex, i);
        out += name === "text" ? a : latexToText(a);
        i = j;
      } else if (name === "left" || name === "right" || name === "displaystyle") {
        // solo tamaño: se ignora
      } else if (name === "quad" || name === "qquad") {
        out += "  ";
      } else {
        out += SYMBOLS[name] ?? name;
      }
    } else if (c === "^" || c === "_") {
      const [a, j] = group(tex, i + 1);
      const inner = latexToText(a);
      const map = c === "^" ? SUP : SUB;
      const chars = [...inner];
      // Sin símbolo para algún carácter: ^(2y), con paréntesis si es más de uno (e^2y sería ambiguo).
      out += chars.every((ch) => map[ch]) ? chars.map((ch) => map[ch]).join("") : `${c}${chars.length > 1 ? `(${inner})` : inner}`;
      i = j;
    } else if (c === "{" || c === "}") {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Texto del chat → párrafos de trozos (normal / negrita), sin LaTeX ni marcas. */
export function solutionToParagraphs(text: string): Run[][] {
  const plain = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => `\n${latexToText(t)}\n`)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => `\n${latexToText(t)}\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => latexToText(t))
    .replace(/(?<![\\$])\$(?!\s)([^$\n`]+?)(?<!\s)\$(?!\d)/g, (_, t) => latexToText(t))
    .replace(/```[^\n`]*\n?([\s\S]*?)```/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\p{Extended_Pictographic}️?/gu, "");
  return plain
    .split(/\n/)
    .map((l) => l.trim())
    // Lo que no es parte de la solución: el aviso de Focus.
    .filter((l) => l && !/focus/i.test(l))
    .map((line) =>
      line
        .split(/(\*\*[^*]+\*\*)/g)
        .filter(Boolean)
        .map((part) => (part.startsWith("**") && part.endsWith("**") && part.length > 4 ? { text: part.slice(2, -2), bold: true } : { text: part.replace(/\*/g, ""), bold: false }))
    );
}

type Measure = (text: string, bold: boolean) => number;

/** Reparte un párrafo en líneas que caben en `width` (palabra a palabra). */
export function wrapRuns(runs: Run[], width: number, measure: Measure): Run[][] {
  const words = runs.flatMap((r) => r.text.split(/(\s+)/).filter(Boolean).map((t) => ({ text: t, bold: r.bold })));
  const lines: Run[][] = [];
  let line: Run[] = [];
  let used = 0;
  for (const w of words) {
    const isSpace = /^\s+$/.test(w.text);
    const size = measure(isSpace ? " " : w.text, w.bold);
    if (isSpace) {
      if (line.length) {
        line.push({ text: " ", bold: w.bold });
        used += size;
      }
      continue;
    }
    if (used + size > width && line.length) {
      while (line.length && line[line.length - 1].text === " ") line.pop();
      lines.push(line);
      line = [];
      used = 0;
    }
    line.push(w);
    used += size;
  }
  while (line.length && line[line.length - 1].text === " ") line.pop();
  if (line.length) lines.push(line);
  return lines;
}

const W = 1080;
const PAD = 80;
const FONT = '"Helvetica Neue", Arial, "Segoe UI", sans-serif';

/** Dibuja la hoja: título, enunciado y la solución, en blanco y negro (como un folio). */
export function drawSolution({ topic, task, text }: { topic: string; task: string; text: string }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = (size: number, bold: boolean) => `${bold ? "700" : "400"} ${size}px ${FONT}`;
  const measureAt = (size: number): Measure => (t, bold) => {
    ctx.font = font(size, bold);
    return ctx.measureText(t).width;
  };
  const inner = W - PAD * 2;

  const blocks = [
    { lines: wrapRuns([{ text: topic, bold: true }], inner, measureAt(46)), size: 46, color: "#111111", gap: 18 },
    { lines: wrapRuns([{ text: task, bold: false }], inner, measureAt(30)), size: 30, color: "#555555", gap: 40 },
    ...solutionToParagraphs(text).map((p) => ({ lines: wrapRuns(p, inner, measureAt(34)), size: 34, color: "#111111", gap: 22 })),
  ];
  const lineH = (size: number) => Math.round(size * 1.45);
  const height = PAD * 2 + blocks.reduce((h, b) => h + b.lines.length * lineH(b.size) + b.gap, 0) + 10;

  // Alta resolución (nítida al hacer zoom), con un tope para no reventar la memoria del móvil.
  canvas.width = W;
  canvas.height = Math.min(height, 8000);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = PAD;
  ctx.textBaseline = "top";
  blocks.forEach((b, bi) => {
    for (const line of b.lines) {
      let x = PAD;
      for (const run of line) {
        ctx.font = font(b.size, run.bold);
        ctx.fillStyle = b.color;
        ctx.fillText(run.text, x, y);
        x += ctx.measureText(run.text).width;
      }
      y += lineH(b.size);
    }
    // Línea separadora bajo el enunciado.
    if (bi === 1) {
      ctx.fillStyle = "#e2e2e2";
      ctx.fillRect(PAD, y + b.gap / 2 - 1, inner, 2);
    }
    y += b.gap;
  });
  return canvas;
}

/** Guarda la imagen: en el móvil abre "Compartir" (Guardar en Fotos, etc.); si no se puede, la descarga. */
export async function saveSolutionImage(data: { topic: string; task: string; text: string }): Promise<void> {
  const canvas = drawSolution(data);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("No pude crear la imagen.");
  const name = `${data.topic.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "solucion"}.png`;
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: data.topic });
      return;
    } catch (err) {
      // Si el estudiante cierra el menú de compartir, no hacemos nada más.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
