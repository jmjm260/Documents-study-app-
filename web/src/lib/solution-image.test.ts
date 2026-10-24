import { describe, expect, it } from "vitest";
import { latexToText, solutionToParagraphs, wrapRuns } from "./solution-image";

describe("latexToText", () => {
  it("fracciones, raíces y potencias", () => {
    expect(latexToText("\\frac{1}{2} + x^2")).toBe("1/2 + x²");
    expect(latexToText("\\frac{x+1}{3}")).toBe("(x+1)/3");
    expect(latexToText("\\sqrt{16} = 4")).toBe("√16 = 4");
    expect(latexToText("a_1 + a_{10}")).toBe("a₁ + a₁₀");
    expect(latexToText("e^{2x}")).toBe("e²ˣ");
    // Sin superíndice para alguna letra: se escribe con ^( ).
    expect(latexToText("e^{2y}")).toBe("e^(2y)");
  });

  it("símbolos y texto", () => {
    expect(latexToText("3 \\cdot 4 \\neq 10 \\Rightarrow \\text{falso}")).toBe("3 · 4 ≠ 10 ⇒ falso");
    expect(latexToText("\\left( \\pi r^2 \\right)")).toBe("( π r² )");
  });
});

describe("solutionToParagraphs", () => {
  it("quita LaTeX, código, emojis y el aviso de Focus; respeta la negrita", () => {
    const text = "Aquí van 🐦\n\n1) $3x + 5 = 20$ → **x = 5**\n\nEn `$t0` queda 5.\n\nAhora te toca Focus conmigo. 🙄";
    expect(solutionToParagraphs(text)).toEqual([
      [{ text: "Aquí van", bold: false }],
      [
        { text: "1) 3x + 5 = 20 → ", bold: false },
        { text: "x = 5", bold: true },
      ],
      [{ text: "En $t0 queda 5.", bold: false }],
    ]);
  });
});

describe("wrapRuns", () => {
  it("parte en líneas sin pasarse del ancho", () => {
    const measure = (t: string) => t.length; // 1 unidad por letra
    const lines = wrapRuns([{ text: "uno dos tres cuatro", bold: false }], 8, measure);
    expect(lines.map((l) => l.map((r) => r.text).join(""))).toEqual(["uno dos", "tres", "cuatro"]);
  });
});
