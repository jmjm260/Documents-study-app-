"use client";

// Piezas de la pantalla Focus: el marco (Shell), un paso de lección con cuenta atrás y la prueba.
import { useEffect, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import RichText from "@/components/RichText";
import type { LessonStep as Step, QuizQuestion } from "@/lib/focus";

export function Shell({
  subtitle,
  progress,
  onBack,
  children,
}: {
  subtitle?: string;
  progress?: number;
  onBack?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col bg-black font-sans text-white">
      <div className="flex h-1 shrink-0">
        <div className="flex-1 bg-[#1450d8]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>
      <header className="shrink-0 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          {onBack && (
            <button onClick={onBack} aria-label="Volver" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-200 active:bg-white/10">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
              </svg>
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold leading-tight tracking-tight">Focus</h1>
            <p className="truncate text-xs text-slate-400">{subtitle ?? "Tus lecciones, por clase"}</p>
            {progress !== undefined && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-[#e5262b] transition-[width] duration-500" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto [color-scheme:dark]">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-5 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

export const FOCUS_TABS = [
  { id: "escuela", label: "Escuela" },
  { id: "cursos", label: "Cursos" },
  { id: "libre", label: "Libre" },
] as const;
export type FocusTab = (typeof FOCUS_TABS)[number]["id"];

/** Las tres partes de Focus: Escuela (clases reales), Cursos (los genera Tocorito) y Libre (lo demás). */
export function FocusTabs({ value, onChange }: { value: FocusTab; onChange: (tab: FocusTab) => void }) {
  return (
    <div role="tablist" aria-label="Partes de Focus" className="mb-3 flex rounded-xl bg-[#161618] p-1">
      {FOCUS_TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`min-h-10 flex-1 rounded-lg text-sm font-semibold transition ${value === t.id ? "bg-[#1450d8] text-white" : "text-slate-400 active:bg-white/10"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <div className="m-auto flex w-full flex-col items-center py-6 text-center">{children}</div>;
}

export function StepCard({ step }: { step: Step }) {
  return (
    <div className="bubble-in rounded-[20px] border-[1.5px] border-white/90 px-4 py-4">
      <h2 className="text-lg font-extrabold leading-snug">{step.heading}</h2>
      <div className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-100">
        <RichText text={step.body} />
      </div>
    </div>
  );
}

export function LessonStep({
  index,
  count,
  title,
  step,
  seconds,
  onNext,
}: {
  index: number;
  count: number;
  title: string;
  step: Step;
  seconds: number;
  onNext: () => void;
}) {
  // Cuenta atrás de lectura: el botón se activa al llegar a 0 (no se puede pasar sin leer).
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const last = index + 1 === count;

  return (
    <div className="flex flex-1 flex-col">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} · Paso {index + 1} de {count}
      </p>
      <StepCard step={step} />
      <div className="mt-auto flex items-end gap-3 pt-6">
        <TocoritoFigure height={64} className="shrink-0" />
        <button
          onClick={onNext}
          disabled={left > 0}
          className="min-h-12 flex-1 rounded-xl bg-[#1450d8] text-[15px] font-bold transition disabled:bg-white/10 disabled:text-slate-400"
        >
          {left > 0 ? `Lee con calma… ${left} s` : last ? "Ir a la prueba" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

/** Prueba de opción múltiple: termina cuando aciertas todas (las falladas vuelven al final). */
export function Quiz({
  label,
  questions,
  passed,
  onPass,
}: {
  label: string;
  questions: QuizQuestion[];
  passed: number[];
  onPass: (index: number) => void;
}) {
  const [order, setOrder] = useState(() => questions.map((_, i) => i).filter((i) => !passed.includes(i)));
  const [picked, setPicked] = useState<number | null>(null);
  const current = order[0];
  const q = questions[current];
  if (!q) return null;
  const right = picked === q.answer;

  function next() {
    if (right) {
      setOrder((o) => o.slice(1));
      onPass(current);
    } else {
      setOrder((o) => [...o.slice(1), o[0]]);
    }
    setPicked(null);
  }

  return (
    <div className="flex flex-1 flex-col">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} · {passed.length} de {questions.length} acertadas
      </p>
      <h2 key={`${current}-${order.length}`} className="bubble-in mt-3 text-lg font-extrabold leading-snug">
        <RichText text={q.question} />
      </h2>
      <div className="mt-4 flex flex-col gap-2">
        {q.options.map((opt, i) => {
          const state = picked === null ? "idle" : i === q.answer ? "right" : i === picked ? "wrong" : "dim";
          return (
            <button
              key={i}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className={`min-h-12 rounded-xl border px-4 py-3 text-left text-[15px] transition ${
                state === "right"
                  ? "border-emerald-400 bg-emerald-500/15 text-emerald-100"
                  : state === "wrong"
                    ? "border-red-400 bg-red-500/15 text-red-100"
                    : state === "dim"
                      ? "border-white/10 text-slate-500"
                      : "border-white/20 active:bg-white/10"
              }`}
            >
              <RichText text={opt} />
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="bubble-in mt-4 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-200">
          <p className="font-bold">{right ? "Bien. Ni yo me lo esperaba. 🐦" : "No. Esta vuelve a salir al final. 🙄"}</p>
          {q.explanation && (
            <p className="mt-1">
              <RichText text={q.explanation} />
            </p>
          )}
        </div>
      )}
      <div className="mt-auto pt-6">
        <button
          onClick={next}
          disabled={picked === null}
          className="min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold transition disabled:bg-white/10 disabled:text-slate-400"
        >
          {picked === null ? "Elige una respuesta" : right && order.length === 1 ? "Terminar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
