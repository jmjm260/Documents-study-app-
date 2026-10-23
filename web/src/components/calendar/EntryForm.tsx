"use client";

// Formulario para anotar una tarea, un examen o una nota en un día.
import { useState } from "react";
import { describeReminder, ENTRY_LIMITS, KIND_INFO, REMINDER_PRESETS, validateEntry, type EntryDraft, type EntryKind } from "@/lib/entries";

const KINDS: EntryKind[] = ["tarea", "examen", "nota"];

const PLACEHOLDER: Record<EntryKind, string> = {
  tarea: "Ej. Ensayo de historia",
  examen: "Ej. Parcial de cálculo",
  nota: "Ej. Llevar la calculadora",
};

const field =
  "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-[#0b1840] outline-none focus:border-[#1450d8] focus:ring-2 focus:ring-[#1450d8]/20";

export default function EntryForm({
  initial,
  onSave,
  onDelete,
}: {
  initial: EntryDraft;
  onSave: (draft: EntryDraft) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EntryDraft>(k: K, v: EntryDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateEntry(draft);
    if (!result.ok) return setError(result.error);
    onSave(result.value);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 pb-2">
      {/* Tipo: control segmentado como en iOS */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Tipo">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={draft.kind === k}
            onClick={() => set("kind", k)}
            className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition ${
              draft.kind === k ? "bg-white text-[#0b1840] shadow-sm" : "text-slate-500"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: KIND_INFO[k].color }} />
            {KIND_INFO[k].label}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-600">
        Título
        <input
          autoFocus
          value={draft.title}
          maxLength={ENTRY_LIMITS.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder={PLACEHOLDER[draft.kind]}
          className={field}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-600">
          Fecha
          <input type="date" required value={draft.date} onChange={(e) => set("date", e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-600">
          Hora
          <input
            type="time"
            value={draft.time ?? ""}
            disabled={draft.time === null}
            onChange={(e) => set("time", e.target.value || null)}
            className={`${field} disabled:bg-slate-50 disabled:text-slate-400`}
          />
        </label>
      </div>

      <label className="flex min-h-11 items-center justify-between rounded-xl border border-slate-200 px-3 text-[15px] text-[#0b1840]">
        Todo el día
        <input
          type="checkbox"
          checked={draft.time === null}
          onChange={(e) => set("time", e.target.checked ? null : "09:00")}
          className="h-5 w-5 accent-[#1450d8]"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-600">
        <span className="flex items-center gap-1.5">
          <BellIcon /> Recordatorio
        </span>
        <span className="relative">
          <select
            value={draft.reminder ?? ""}
            onChange={(e) => set("reminder", e.target.value === "" ? null : Number(e.target.value))}
            className={`${field} appearance-none pr-9`}
          >
            <option value="">Sin aviso</option>
            {[...new Set([...REMINDER_PRESETS, ...(draft.reminder !== null ? [draft.reminder] : [])])]
              .sort((a, b) => a - b)
              .map((m) => (
                <option key={m} value={m}>
                  {describeReminder(m)}
                </option>
              ))}
          </select>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </span>
        {draft.reminder !== null && draft.time === null && (
          <span className="text-xs font-normal text-slate-400">En “todo el día”, el aviso cuenta desde las 8:00.</span>
        )}
      </label>

      {draft.kind !== "nota" && (
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-600">
          Materia <span className="-mt-1 text-xs font-normal text-slate-400">Opcional</span>
          <input
            value={draft.course ?? ""}
            maxLength={ENTRY_LIMITS.course}
            onChange={(e) => set("course", e.target.value)}
            placeholder="Ej. MAT 201"
            className={field}
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-600">
        {draft.kind === "nota" ? "Nota" : "Detalles"} <span className="-mt-1 text-xs font-normal text-slate-400">Opcional</span>
        <textarea
          value={draft.notes}
          maxLength={ENTRY_LIMITS.notes}
          onChange={(e) => set("notes", e.target.value)}
          rows={3}
          placeholder={draft.kind === "examen" ? "Temas, aula, qué llevar…" : "Lo que quieras recordar"}
          className={`${field} min-h-24 py-2.5`}
        />
      </label>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-[#b81d21]">{error}</p>}

      <div className="flex gap-2 pt-1">
        {onDelete && (
          <button type="button" onClick={onDelete} className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[#e5262b] active:bg-red-50">
            Eliminar
          </button>
        )}
        <button type="submit" className="min-h-12 flex-1 rounded-xl bg-[#1450d8] text-[15px] font-bold text-white shadow-sm active:bg-[#0d3bb5]">
          Guardar
        </button>
      </div>
    </form>
  );
}

export function BellIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 003.4 0" />
    </svg>
  );
}
