import { describe, expect, it } from "vitest";
import { tokenizeMath } from "./RichText";

describe("tokenizeMath", () => {
  it("separa fórmulas en línea y en bloque", () => {
    expect(tokenizeMath("La presión $p$ empuja:\n$$F = ma$$")).toEqual([
      { kind: "text", value: "La presión " },
      { kind: "inline", value: "p" },
      { kind: "text", value: " empuja:\n" },
      { kind: "display", value: "F = ma" },
    ]);
  });

  it("acepta \\( \\) y \\[ \\]", () => {
    expect(tokenizeMath("\\(x^2\\) y \\[y = 2\\]").map((t) => t.kind)).toEqual(["inline", "text", "display"]);
  });

  it("no confunde precios con fórmulas", () => {
    expect(tokenizeMath("Cuesta $5 y luego $10")).toEqual([{ kind: "text", value: "Cuesta $5 y luego $10" }]);
  });

  it("texto sin fórmulas queda igual", () => {
    expect(tokenizeMath("hola asere")).toEqual([{ kind: "text", value: "hola asere" }]);
  });
});
