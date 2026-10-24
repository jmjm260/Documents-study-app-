"use client";

// Focus: mini lección (2–4 min) + prueba rápida sobre la tarea que Tocorito resolvió.
// No se puede saltar: cada paso tiene un tiempo mínimo y la prueba termina cuando aciertas todas
// (las falladas vuelven al final). Mientras tanto, el chat está bloqueado.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import RichText from "@/components/RichText";
import { stepSeconds } from "@/lib/focus";
import { FOCUS_EVENT, loadFocus, prefetchLesson, saveFocus, type FocusState } from "@/lib/focus-store";
import { saveSolutionImage } from "@/lib/solution-image";

export default function FocusPage() {
  const router = useRouter();
  // undefined = aún leyendo el almacenamiento; null = no hay nada pendiente.
  const [focus, setFocus] = useState<FocusState | null | undefined>(undefined);
  // Al terminar se guarda aquí lo resuelto: la imagen de la solución se desbloquea después del Focus.
  const [finished, setFinished] = useState<Pick<FocusState, "topic" | "task" | "solution"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => setFocus(loadFocus());
    sync();
    window.addEventListener(FOCUS_EVENT, sync);
    return () => window.removeEventListener(FOCUS_EVENT, sync);
  }, []);

  // Pedir la lección si aún no está (normalmente el chat ya la pidió por adelantado).
  const needsLesson = focus && !focus.lesson && !error;
  useEffect(() => {
    if (!needsLesson) return;
    prefetchLesson(focus).catch((err) => setError(err instanceof Error ? err.message : "No pude preparar la lección."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el Focus pendiente
  }, [needsLesson, focus?.id]);

  function update(patch: Partial<FocusState>) {
    if (!focus) return;
    const next = { ...focus, ...patch };
    saveFocus(next);
    setFocus(next);
  }

  function complete() {
    if (focus) setFinished({ topic: focus.topic, task: focus.task, solution: focus.solution });
    saveFocus(null);
  }

  async function saveImage() {
    if (!finished) return;
    setSaving(true);
    setError(null);
    try {
      await saveSolutionImage({ topic: finished.topic, task: finished.task, text: finished.solution });
    } catch {
      setError("No pude crear la imagen.");
    } finally {
      setSaving(false);
    }
  }

  if (focus === undefined) return <Shell />;

  if (finished !== null) {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={140} sipping />
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">Focus completado</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Mira tú… ahora sí sabes lo que entregas de {finished.topic}. Ya puedes volver al chat.
          </p>
          {finished.solution && (
            <button
              onClick={saveImage}
              disabled={saving}
              className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#e5262b] text-[15px] font-bold disabled:opacity-60"
            >
              {saving ? "Creando imagen…" : "Guardar imagen de la solución"}
            </button>
          )}
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          <button
            onClick={() => router.push("/")}
            className={`${finished.solution ? "mt-2 border border-white/15" : "mt-6 bg-[#1450d8]"} min-h-12 w-full max-w-xs rounded-xl text-[15px] font-bold`}
          >
            Volver al chat
          </button>
        </Center>
      </Shell>
    );
  }

  if (!focus) {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={130} />
          <h2 className="mt-4 text-xl font-extrabold tracking-tight">Nada pendiente</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Cuando Tocorito te resuelva una tarea, aquí te toca una mini lección de 2–4 minutos y una prueba rápida sobre ella.
          </p>
        </Center>
      </Shell>
    );
  }

  if (!focus.lesson) {
    return (
      <Shell topic={focus.topic}>
        <Center>
          <TocoritoFigure height={130} sipping={!error} />
          {error ? (
            <>
              <p className="mt-4 max-w-sm text-sm text-red-300">{error}</p>
              <button onClick={() => setError(null)} className="mt-4 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
                Intentar otra vez
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-xl font-extrabold tracking-tight">Preparando tu lección…</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-400">Tocorito te resolvió «{focus.task}». Ahora vas a entenderlo. Sí, tú.</p>
            </>
          )}
        </Center>
      </Shell>
    );
  }

  const lesson = focus.lesson;
  const total = lesson.steps.length + 1;
  const done = focus.phase === "quiz" ? lesson.steps.length : focus.step;

  return (
    <Shell topic={focus.topic} progress={done / total}>
      {focus.phase === "lesson" ? (
        <LessonStep
          key={focus.step}
          index={focus.step}
          count={lesson.steps.length}
          title={lesson.title}
          step={lesson.steps[focus.step]}
          seconds={stepSeconds(lesson)}
          onNext={() => (focus.step + 1 < lesson.steps.length ? update({ step: focus.step + 1 }) : update({ phase: "quiz" }))}
        />
      ) : (
        <Quiz
          questions={lesson.quiz}
          passed={focus.passed}
          onPass={(i) => {
            const passed = [...focus.passed, i];
            if (passed.length >= lesson.quiz.length) complete();
            else update({ passed });
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ topic, progress, children }: { topic?: string; progress?: number; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-black font-sans text-white">
      <div className="flex h-1 shrink-0">
        <div className="flex-1 bg-[#1450d8]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>
      <header className="shrink-0 border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-[17px] font-extrabold leading-tight tracking-tight">Focus</h1>
          <p className="truncate text-xs text-slate-400">{topic ?? "Lecciones después de cada tarea"}</p>
          {progress !== undefined && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[#e5262b] transition-[width] duration-500" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto [color-scheme:dark]">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-5 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="m-auto flex w-full flex-col items-center py-6 text-center">{children}</div>;
}

function LessonStep({
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
  step: { heading: string; body: string };
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
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} · Paso {index + 1} de {count}
      </p>
      <div className="bubble-in mt-3 rounded-[20px] border-[1.5px] border-white/90 px-4 py-4">
        <h2 className="text-lg font-extrabold leading-snug">{step.heading}</h2>
        <div className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-100">
          <RichText text={step.body} />
        </div>
      </div>
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

function Quiz({
  questions,
  passed,
  onPass,
}: {
  questions: { question: string; options: string[]; answer: number; explanation: string }[];
  passed: number[];
  onPass: (index: number) => void;
}) {
  // Orden de las que faltan: las falladas se van al final y vuelven a salir.
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
        Prueba rápida · {passed.length} de {questions.length} acertadas
      </p>
      <h2 key={`${current}-${order.length}`} className="bubble-in mt-3 text-lg font-extrabold leading-snug">
        <RichText text={q.question} />
      </h2>
      <div className="mt-4 flex flex-col gap-2">
        {q.options.map((opt, i) => {
          const state =
            picked === null ? "idle" : i === q.answer ? "right" : i === picked ? "wrong" : "dim";
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
