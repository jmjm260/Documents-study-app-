"use client";

// Focus:
// 1) Lección obligatoria: tras resolver una tarea, mini lección (2–4 min) + prueba rápida. No se puede
//    saltar (tiempo mínimo por paso; la prueba acaba cuando aciertas todas). El chat queda bloqueado.
// 2) Biblioteca: las lecciones terminadas se guardan por clase y se pueden releer.
// 3) Pruebas de repaso: si anotas un examen de una clase con lecciones, Tocorito te deja una aquí.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import { Center, LessonStep, Quiz, Shell, StepCard } from "@/components/focus/FocusParts";
import { stepSeconds } from "@/lib/focus";
import {
  completeFocus,
  deleteLesson,
  finishReview,
  FOCUS_EVENT,
  loadFocus,
  loadLibrary,
  loadReviews,
  prefetchLesson,
  prefetchReview,
  saveFocus,
  updateReview,
  type FocusState,
  type Review,
  type SavedLesson,
} from "@/lib/focus-store";
import { saveSolutionImage } from "@/lib/solution-image";

type View =
  | { kind: "home" }
  | { kind: "lesson"; id: string }
  | { kind: "review"; id: string }
  | { kind: "focusDone"; saved: SavedLesson | null; topic: string }
  | { kind: "reviewDone"; course: string };

export default function FocusPage() {
  const router = useRouter();
  // undefined = aún leyendo el almacenamiento.
  const [focus, setFocus] = useState<FocusState | null | undefined>(undefined);
  const [library, setLibrary] = useState<SavedLesson[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [view, setView] = useState<View>({ kind: "home" });

  useEffect(() => {
    const sync = () => {
      setFocus(loadFocus());
      setLibrary(loadLibrary());
      setReviews(loadReviews());
    };
    sync();
    window.addEventListener(FOCUS_EVENT, sync);
    return () => window.removeEventListener(FOCUS_EVENT, sync);
  }, []);

  if (focus === undefined) return <Shell />;

  if (view.kind === "focusDone") {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={140} sipping />
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">Focus completado</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Mira tú… ahora sí sabes lo que entregas de {view.topic}. La lección queda guardada aquí en Focus.
          </p>
          {view.saved?.solution && <SaveImageButton lesson={view.saved} primary />}
          <button
            onClick={() => router.push("/")}
            className={`${view.saved?.solution ? "mt-2 border border-white/15" : "mt-6 bg-[#1450d8]"} min-h-12 w-full max-w-xs rounded-xl text-[15px] font-bold`}
          >
            Volver al chat
          </button>
        </Center>
      </Shell>
    );
  }

  // Hay una lección obligatoria pendiente: no se ve nada más hasta terminarla.
  if (focus) return <MandatoryFocus focus={focus} onDone={(saved) => setView({ kind: "focusDone", saved, topic: focus.topic })} />;

  if (view.kind === "reviewDone") {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={140} sipping />
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">Repaso terminado</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            {view.course}: repasado. Si suspendes ahora, ya no es culpa mía. 🐦
          </p>
          <button onClick={() => setView({ kind: "home" })} className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
            Volver a Focus
          </button>
        </Center>
      </Shell>
    );
  }

  if (view.kind === "review") {
    const review = reviews.find((r) => r.id === view.id);
    if (review) {
      return (
        <ReviewRunner
          review={review}
          onBack={() => setView({ kind: "home" })}
          onDone={() => {
            finishReview(review.id);
            setView({ kind: "reviewDone", course: review.course });
          }}
        />
      );
    }
  }

  if (view.kind === "lesson") {
    const saved = library.find((l) => l.id === view.id);
    if (saved) {
      return (
        <Shell subtitle={`${saved.course} · ${saved.topic}`} onBack={() => setView({ kind: "home" })}>
          <p className="text-sm text-slate-400">Tarea: {saved.task}</p>
          <div className="mt-4 flex flex-col gap-3">
            {saved.lesson.steps.map((s, i) => (
              <StepCard key={i} step={s} />
            ))}
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 pb-2">
            {saved.solution && <SaveImageButton lesson={saved} />}
            <button
              onClick={() => {
                if (!window.confirm("¿Borrar esta lección de Focus?")) return;
                deleteLesson(saved.id);
                setView({ kind: "home" });
              }}
              className="min-h-11 text-sm text-slate-500 active:text-red-300"
            >
              Borrar lección
            </button>
          </div>
        </Shell>
      );
    }
  }

  return <Home library={library} reviews={reviews} onOpenLesson={(id) => setView({ kind: "lesson", id })} onOpenReview={(id) => setView({ kind: "review", id })} />;
}

function MandatoryFocus({ focus, onDone }: { focus: FocusState; onDone: (saved: SavedLesson | null) => void }) {
  const [error, setError] = useState<string | null>(null);

  // Pedir la lección si aún no está (normalmente el chat ya la pidió por adelantado).
  const needsLesson = !focus.lesson && !error;
  useEffect(() => {
    if (!needsLesson) return;
    prefetchLesson(focus).catch((err) => setError(err instanceof Error ? err.message : "No pude preparar la lección."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el Focus pendiente
  }, [needsLesson, focus.id]);

  const update = (patch: Partial<FocusState>) => saveFocus({ ...focus, ...patch });

  if (!focus.lesson) {
    return (
      <Shell subtitle={`${focus.course} · ${focus.topic}`}>
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
  const done = focus.phase === "quiz" ? lesson.steps.length : focus.step;
  return (
    <Shell subtitle={`${focus.course} · ${focus.topic}`} progress={done / (lesson.steps.length + 1)}>
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
          label="Prueba rápida"
          questions={lesson.quiz}
          passed={focus.passed}
          onPass={(i) => {
            const passed = [...focus.passed, i];
            if (passed.length >= lesson.quiz.length) onDone(completeFocus(focus));
            else update({ passed });
          }}
        />
      )}
    </Shell>
  );
}

function ReviewRunner({ review, onBack, onDone }: { review: Review; onBack: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const needsQuiz = !review.quiz && !error;
  useEffect(() => {
    if (!needsQuiz) return;
    prefetchReview(review).catch((err) => setError(err instanceof Error ? err.message : "No pude preparar el repaso."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia el repaso
  }, [needsQuiz, review.id]);

  const subtitle = `Repaso de ${review.course}${review.exam ? ` · ${review.exam}` : ""}`;
  if (!review.quiz) {
    return (
      <Shell subtitle={subtitle} onBack={onBack}>
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
            <h2 className="mt-4 text-xl font-extrabold tracking-tight">Preparando tu repaso…</h2>
          )}
        </Center>
      </Shell>
    );
  }
  const quiz = review.quiz;
  return (
    <Shell subtitle={subtitle} progress={review.passed.length / quiz.length} onBack={onBack}>
      <Quiz
        label="Repaso"
        questions={quiz}
        passed={review.passed}
        onPass={(i) => {
          const passed = [...review.passed, i];
          if (passed.length >= quiz.length) onDone();
          else updateReview({ ...review, passed });
        }}
      />
    </Shell>
  );
}

function Home({
  library,
  reviews,
  onOpenLesson,
  onOpenReview,
}: {
  library: SavedLesson[];
  reviews: Review[];
  onOpenLesson: (id: string) => void;
  onOpenReview: (id: string) => void;
}) {
  if (!library.length && !reviews.length) {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={130} />
          <h2 className="mt-4 text-xl font-extrabold tracking-tight">Nada todavía</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Cuando Tocorito te resuelva una tarea, aquí te toca una mini lección y una prueba rápida. Se quedan guardadas por
            clase, y antes de un examen te hace un repaso con ellas.
          </p>
        </Center>
      </Shell>
    );
  }

  // Lecciones agrupadas por clase, la más reciente primero.
  const byCourse = new Map<string, SavedLesson[]>();
  for (const l of [...library].sort((a, b) => b.completedAt - a.completedAt)) byCourse.set(l.course, [...(byCourse.get(l.course) ?? []), l]);
  const dateFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

  return (
    <Shell>
      {reviews.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pruebas de repaso</h2>
          <div className="flex flex-col gap-2">
            {reviews.map((r) => (
              <button
                key={r.id}
                onClick={() => onOpenReview(r.id)}
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#e5262b]/60 bg-[#e5262b]/10 px-4 py-3 text-left active:bg-[#e5262b]/20"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e5262b]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">Repaso de {r.course}</span>
                  <span className="block truncate text-xs text-red-100/80">
                    {r.exam || "Antes del examen"} · {r.quiz ? `${r.quiz.length} preguntas` : "preparando…"}
                  </span>
                </span>
                <span className="text-sm font-bold text-white">Empezar</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {[...byCourse].map(([course, lessons]) => (
        <section key={course} className="mb-6">
          <h2 className="mb-2 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            <span>{course}</span>
            <span className="normal-case">{lessons.length} {lessons.length === 1 ? "lección" : "lecciones"}</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {lessons.map((l, i) => (
              <button
                key={l.id}
                onClick={() => onOpenLesson(l.id)}
                className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10 ${i ? "border-t border-white/10" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.topic}</span>
                  <span className="block truncate text-xs text-slate-400">{l.task}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{dateFmt.format(l.completedAt)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </Shell>
  );
}

function SaveImageButton({ lesson, primary = false }: { lesson: Pick<SavedLesson, "topic" | "task" | "solution">; primary?: boolean }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveSolutionImage({ topic: lesson.topic, task: lesson.task, text: lesson.solution });
    } catch {
      setError("No pude crear la imagen.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button
        onClick={save}
        disabled={saving}
        className={`${primary ? "mt-6 bg-[#e5262b]" : "border border-white/15"} min-h-12 w-full max-w-xs rounded-xl text-[15px] font-bold disabled:opacity-60`}
      >
        {saving ? "Creando imagen…" : "Guardar imagen de la solución"}
      </button>
      {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
    </>
  );
}
