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

  it("el código con $ (registros de MIPS) no es fórmula", () => {
    expect(tokenizeMath("Pon 5 en `$t0`. Y `$zero` vale 0.")).toEqual([
      { kind: "text", value: "Pon 5 en " },
      { kind: "code", value: "$t0" },
      { kind: "text", value: ". Y " },
      { kind: "code", value: "$zero" },
      { kind: "text", value: " vale 0." },
    ]);
  });

  it("un $0 suelto no se empareja con el $ de dentro del código", () => {
    expect(tokenizeMath("put $0 + 5 into `$t0`. So").map((t) => t.kind)).toEqual(["text", "code", "text"]);
  });

  it("bloque de código con ```", () => {
    expect(tokenizeMath("Mira:\n```asm\naddi $t0, $zero, 5\naddi $t1, $t0, 3\n```")).toEqual([
      { kind: "text", value: "Mira:\n" },
      { kind: "codeblock", value: "addi $t0, $zero, 5\naddi $t1, $t0, 3" },
    ]);
  });

  it("texto sin fórmulas queda igual", () => {
    expect(tokenizeMath("hola asere")).toEqual([{ kind: "text", value: "hola asere" }]);
  });
});
