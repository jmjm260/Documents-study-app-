"use client";

// Selector de nivel de razonamiento dentro de la barra de mensaje (estilo ChatGPT):
// un botón "Medio ⌄" que abre una tarjeta con un deslizador de 3 posiciones.
// Solo elige el NIVEL; qué modelo y parámetros se usan lo decide el servidor.
import { useEffect, useRef, useState } from "react";
import { LEVEL_INFO, REASONING_LEVELS, SLOWER_LEVELS_WARNING, type ReasoningLevel } from "@/lib/ai/reasoning";

export default function LevelPicker({
  value,
  defaultLevel,
  available,
  noRealReasoning,
  disabled,
  onChange,
  onMakeDefault,
}: {
  value: ReasoningLevel;
  defaultLevel: ReasoningLevel;
  available: readonly ReasoningLevel[];
  /** Niveles que con el modelo actual no cambian de verdad la profundidad. */
  noRealReasoning: readonly ReasoningLevel[];
  disabled: boolean;
  onChange: (level: ReasoningLevel) => void;
  onMakeDefault: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const levels = REASONING_LEVELS.filter((l) => available.includes(l));
  const index = Math.max(0, levels.indexOf(value));
  const percent = levels.length > 1 ? (index / (levels.length - 1)) * 100 : 0;

  // Cerrar al tocar fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    // Sin "relative": la tarjeta se alinea con la barra de mensaje entera (cabe bien en móvil).
    <div ref={ref} className="shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Esfuerzo de razonamiento: ${LEVEL_INFO[value].label}`}
        className={`flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium transition disabled:opacity-50 ${
          open ? "bg-slate-100 text-slate-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`}
      >
        {open ? "Razonamiento" : LEVEL_INFO[value].label}
        <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Esfuerzo de razonamiento"
          className="absolute bottom-full right-0 z-30 mb-2 w-[min(19rem,100%)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          <p className="text-center text-[15px] font-semibold text-[#0b1840]">{LEVEL_INFO[value].label}</p>

          {/* Deslizador de 3 posiciones. Es un <input type="range"> para que funcione con teclado y lectores de pantalla. */}
          <div className="relative mt-3 h-9">
            <div className="absolute inset-x-0 top-1/2 h-9 -translate-y-1/2 rounded-full bg-slate-100" />
            <div
              className="absolute left-0 top-1/2 h-9 -translate-y-1/2 rounded-full bg-[#1450d8] transition-[width]"
              style={{ width: `calc(2.25rem + (100% - 2.25rem) * ${percent / 100})` }}
            />
            {levels.map((l, i) => (
              <span
                key={l}
                className={`pointer-events-none absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${i <= index ? "bg-white/70" : "bg-slate-400"}`}
                style={{ left: `calc(1.125rem + (100% - 2.25rem) * ${levels.length > 1 ? i / (levels.length - 1) : 0})` }}
              />
            ))}
            <span
              className="pointer-events-none absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition-[left]"
              style={{ left: `calc(1.125rem + (100% - 2.25rem) * ${percent / 100})` }}
            />
            <input
              type="range"
              min={0}
              max={levels.length - 1}
              step={1}
              value={index}
              onChange={(e) => onChange(levels[Number(e.target.value)])}
              aria-label="Esfuerzo de razonamiento"
              aria-valuetext={LEVEL_INFO[value].label}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
          <div className="mt-1.5 flex justify-between px-1 text-[11px] font-medium text-slate-400">
            {levels.map((l) => (
              <button key={l} type="button" onClick={() => onChange(l)} className={l === value ? "text-[#1450d8]" : "hover:text-slate-600"}>
                {LEVEL_INFO[l].label}
              </button>
            ))}
          </div>

          <p className="mt-3 text-xs leading-snug text-slate-600">{LEVEL_INFO[value].description}</p>
          {value !== "instant" && <p className="mt-1 text-[11px] leading-snug text-slate-400">{SLOWER_LEVELS_WARNING}</p>}
          {noRealReasoning.includes(value) && (
            <p className="mt-1 text-[11px] leading-snug text-amber-700">Este modelo no permite cambiar la profundidad de razonamiento.</p>
          )}
          <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs">
            {value === defaultLevel ? (
              <span className="text-slate-400">Es tu nivel predeterminado.</span>
            ) : (
              <button type="button" onClick={onMakeDefault} className="font-semibold text-[#1450d8] hover:underline">
                Usar siempre este nivel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
