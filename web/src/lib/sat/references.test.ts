import { describe, expect, it } from "vitest";
import { bandAccepted, expectedBand, REFERENCES, referenceCoverage } from "./references";

describe("referencias oficiales", () => {
  it("hay al menos una muestra oficial por cada una de las 11 familias", () => {
    const cov = referenceCoverage();
    expect(cov).toHaveLength(11);
    for (const c of cov) expect(c.skillRefs).toBeGreaterThan(0);
    expect(REFERENCES).toHaveLength(15);
  });

  it("registra explícitamente las celdas sin referencia oficial de dificultad", () => {
    for (const c of referenceCoverage()) expect(c.note).toMatch(/Sin referencia oficial etiquetada para: easy, medium, hard/);
  });

  it("bandas esperadas y aceptación (±1; la banda avanzada exige hard o más)", () => {
    expect(expectedBand(1)).toBe("fundamentos");
    expect(expectedBand(6)).toBe("hard");
    expect(bandAccepted(4, "medium", 6)).toBe(true);
    expect(bandAccepted(4, "por encima", 6)).toBe(false);
    expect(bandAccepted(6, "medium", 6)).toBe(false);
    expect(bandAccepted(7, "hard", 6)).toBe(true);
  });
});
