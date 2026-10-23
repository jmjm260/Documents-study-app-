"use client";

// Selector de nivel de razonamiento: [ ⚡ Instantáneo | 🧠 Medio | 🧠🧠 Alto ].
// Solo elige el NIVEL; qué modelo y parámetros se usan lo decide el servidor.
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
  const info = LEVEL_INFO[value];
  return (
    <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-1">
      <div role="radiogroup" aria-label="Velocidad de respuesta" className="flex rounded-full bg-slate-100 p-0.5">
        {REASONING_LEVELS.filter((l) => available.includes(l)).map((level) => {
          const active = level === value;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              title={LEVEL_INFO[level].description}
              onClick={() => onChange(level)}
              className={`flex min-h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold transition disabled:opacity-60 ${
                active ? "bg-white text-[#0b1840] shadow-sm" : "text-slate-500 hover:text-[#0b1840]"
              }`}
            >
              <span aria-hidden>{LEVEL_INFO[level].icon}</span>
              {LEVEL_INFO[level].label}
            </button>
          );
        })}
      </div>
      <p className="min-w-0 flex-1 text-[11px] leading-tight text-slate-500">
        {info.description}
        {value !== "instant" && <span className="text-slate-400"> {SLOWER_LEVELS_WARNING}</span>}
        {noRealReasoning.includes(value) && (
          <span className="block text-amber-700">Este modelo no permite cambiar la profundidad de razonamiento.</span>
        )}
      </p>
      {value !== defaultLevel && (
        <button type="button" onClick={onMakeDefault} className="text-[11px] font-semibold text-[#1450d8] hover:underline">
          Usar siempre
        </button>
      )}
    </div>
  );
}
