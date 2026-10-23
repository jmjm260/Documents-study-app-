// Regla de la app: solo 13 años o más (sin guardar el día de nacimiento, solo año y mes).
// La base de datos vuelve a comprobarlo al crear la cuenta (no se puede saltar desde el navegador).
export const MIN_AGE = 13;

export function ageInMonths(birthYear: number, birthMonth: number, now = new Date()): number {
  return (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMonth);
}

export function isOldEnough(birthYear: number, birthMonth: number, now = new Date()): boolean {
  return ageInMonths(birthYear, birthMonth, now) >= MIN_AGE * 12;
}

export function validBirth(year: unknown, month: unknown, now = new Date()): year is number {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    (year as number) >= 1900 &&
    (year as number) <= now.getFullYear() &&
    (month as number) >= 1 &&
    (month as number) <= 12
  );
}
