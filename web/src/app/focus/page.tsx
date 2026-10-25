"use client";

// Focus:
// 1) Lección obligatoria: tras resolver una tarea, mini lección (2–4 min) + prueba rápida. No se puede
//    saltar (tiempo mínimo por paso; la prueba acaba cuando aciertas todas). El chat queda bloqueado.
// 2) Biblioteca: las lecciones terminadas se guardan por clase y se pueden releer.
// 3) Pruebas de repaso: si anotas un examen de una clase con lecciones, Tocorito te deja una aquí.
// Lo ya hecho (lecciones y repasos) se puede repetir igual, pero sin esperas: ya lo leíste una vez.
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
  isPendingReview,
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
  // `from`: a dónde vuelve (a la lista de Focus o a la lección abierta).
  | { kind: "practice"; id: string; from: "home" | "lesson" }
  | { kind: "review"; id: string }
  | { kind: "focusDone"; saved: SavedLesson | null; topic: string }
  | { kind: "practiceDone"; id: string; topic: string; from: "home" | "lesson" }
  | { kind: "reviewDone"; course: string; retake: boolean };

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
          {view.saved?.solution && <SaveImageButton lesson={view.saved} variant="primary" />}
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
            {view.retake
              ? `${view.course}, otra vez. Mira tú, repasando por gusto. Queda guardado por si quieres más. 🐦`
              : `${view.course}: repasado. Si suspendes ahora, ya no es culpa mía. Queda guardado aquí por si quieres repetirlo. 🐦`}
          </p>
          <button onClick={() => setView({ kind: "home" })} className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
            Volver a Focus
          </button>
        </Center>
      </Shell>
    );
  }

  if (view.kind === "practiceDone") {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={140} sipping />
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">Lección repetida</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">{view.topic}, otra vez. Ni yo repaso tanto. 🐦</p>
          <button
            onClick={() => setView({ kind: "practice", id: view.id, from: view.from })}
            className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold"
          >
            Repetir otra vez
          </button>
          <button
            onClick={() => setView(view.from === "lesson" ? { kind: "lesson", id: view.id } : { kind: "home" })}
            className="mt-2 min-h-12 w-full max-w-xs rounded-xl border border-white/15 text-[15px] font-bold"
          >
            {view.from === "lesson" ? "Volver a la lección" : "Volver a Focus"}
          </button>
        </Center>
      </Shell>
    );
  }

  if (view.kind === "review") {
    const review = reviews.find((r) => r.id === view.id);
    if (review) {
      // Ya hecho: se repite sin guardar el progreso (empieza siempre desde la primera pregunta).
      const retake = !isPendingReview(review);
      return (
        <ReviewRunner
          key={review.id}
          review={review}
          retake={retake}
          onBack={() => setView({ kind: "home" })}
          onDone={() => {
            if (!retake) finishReview(review.id);
            setView({ kind: "reviewDone", course: review.course, retake });
          }}
        />
      );
    }
  }

  if (view.kind === "practice") {
    const saved = library.find((l) => l.id === view.id);
    if (saved) {
      return (
        <PracticeLesson
          key={`${saved.id}-${view.from}`}
          saved={saved}
          onBack={() => setView(view.from === "lesson" ? { kind: "lesson", id: saved.id } : { kind: "home" })}
          onDone={() => setView({ kind: "practiceDone", id: saved.id, topic: saved.topic, from: view.from })}
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
          {/* Repetir y Guardar imagen están en la lista de Focus, junto al nombre: aquí solo se lee. */}
          <div className="mt-6 flex flex-col items-center pb-2">
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

  return (
    <Home
      library={library}
      reviews={reviews}
      onOpenLesson={(id) => setView({ kind: "lesson", id })}
      onPractice={(id) => setView({ kind: "practice", id, from: "home" })}
      onOpenReview={(id) => setView({ kind: "review", id })}
    />
  );
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

function ReviewRunner({ review, retake, onBack, onDone }: { review: Review; retake: boolean; onBack: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  // Al repetir, el progreso vive solo en pantalla (el repaso guardado no cambia).
  const [retakePassed, setRetakePassed] = useState<number[]>([]);
  const passed = retake ? retakePassed : review.passed;
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
    <Shell subtitle={subtitle} progress={passed.length / quiz.length} onBack={onBack}>
      <Quiz
        label={retake ? "Repaso (otra vez)" : "Repaso"}
        questions={quiz}
        passed={passed}
        onPass={(i) => {
          const next = [...passed, i];
          if (next.length >= quiz.length) onDone();
          else if (retake) setRetakePassed(next);
          else updateReview({ ...review, passed: next });
        }}
      />
    </Shell>
  );
}

/** Repetir una lección ya hecha: mismos pasos y misma prueba, pero sin cuenta atrás. */
function PracticeLesson({ saved, onBack, onDone }: { saved: SavedLesson; onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"lesson" | "quiz">("lesson");
  const [passed, setPassed] = useState<number[]>([]);
  const lesson = saved.lesson;
  const done = phase === "quiz" ? lesson.steps.length : step;
  return (
    <Shell subtitle={`${saved.course} · ${saved.topic} (repaso)`} progress={done / (lesson.steps.length + 1)} onBack={onBack}>
      {phase === "lesson" ? (
        <LessonStep
          key={step}
          index={step}
          count={lesson.steps.length}
          title={lesson.title}
          step={lesson.steps[step]}
          seconds={0}
          onNext={() => (step + 1 < lesson.steps.length ? setStep(step + 1) : setPhase("quiz"))}
        />
      ) : (
        <Quiz
          label="Prueba rápida (otra vez)"
          questions={lesson.quiz}
          passed={passed}
          onPass={(i) => {
            const next = [...passed, i];
            if (next.length >= lesson.quiz.length) onDone();
            else setPassed(next);
          }}
        />
      )}
    </Shell>
  );
}

function Home({
  library,
  reviews,
  onOpenLesson,
  onPractice,
  onOpenReview,
}: {
  library: SavedLesson[];
  reviews: Review[];
  onOpenLesson: (id: string) => void;
  onPractice: (id: string) => void;
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
  const pending = reviews.filter(isPendingReview);
  const done = reviews.filter((r) => !isPendingReview(r)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));

  return (
    <Shell>
      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pruebas de repaso</h2>
          <div className="flex flex-col gap-2">
            {pending.map((r) => (
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
      {done.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Repasos hechos</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10">
            {done.map((r, i) => (
              <button
                key={r.id}
                onClick={() => onOpenReview(r.id)}
                className={`flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10 ${i ? "border-t border-white/10" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">Repaso de {r.course}</span>
                  <span className="block truncate text-xs text-slate-400">
                    {r.exam || "Antes del examen"} · {r.quiz?.length ?? 0} preguntas
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold text-[#6ea0ff]">Repetir</span>
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
              // Tocar el nombre abre la lección; "Repetir" la empieza directamente (sin abrirla ni bajar).
              <div key={l.id} className={`flex items-center ${i ? "border-t border-white/10" : ""}`}>
                <button onClick={() => onOpenLesson(l.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left active:bg-white/10">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 font-semibold leading-snug">{l.topic}</span>
                    <span className="block truncate text-xs text-slate-400">{l.task}</span>
                  </span>
                  {/* En el móvil la fecha se esconde para que quepa el nombre junto a "Repetir". */}
                  <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">{dateFmt.format(l.completedAt)}</span>
                </button>
                <button
                  onClick={() => onPractice(l.id)}
                  aria-label={`Repetir lección y prueba: ${l.topic}`}
                  className={`${l.solution ? "mr-2" : "mr-3"} flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-[#1450d8] px-3.5 text-sm font-bold text-white active:bg-[#1450d8]/80`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
                  </svg>
                  Repetir
                </button>
                {l.solution && (
                  <span className="mr-3 shrink-0">
                    <SaveImageButton lesson={l} variant="icon" />
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </Shell>
  );
}

/** "primary": botón grande (al terminar el Focus). "icon": botón redondo para la lista de lecciones. */
function SaveImageButton({ lesson, variant }: { lesson: Pick<SavedLesson, "topic" | "task" | "solution">; variant: "primary" | "icon" }) {
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
  if (variant === "icon") {
    const label = error ?? (saving ? "Creando imagen…" : `Guardar imagen de la solución: ${lesson.topic}`);
    return (
      <button
        onClick={save}
        disabled={saving}
        aria-label={label}
        title={label}
        className={`flex h-11 w-11 items-center justify-center rounded-full border transition disabled:opacity-60 ${
          error ? "border-red-400 text-red-300" : "border-white/20 text-slate-200 active:bg-white/10"
        }`}
      >
        {/* Icono de imagen con flecha de descarga */}
        <svg viewBox="0 0 24 24" className={`h-5 w-5 ${saving ? "animate-pulse" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <rect x="3.5" y="4" width="17" height="13" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 14l4.5-4 4 3.5 3-2.5 5 4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 17.5v4M9.8 19.5L12 21.6l2.2-2.1" />
        </svg>
      </button>
    );
  }
  return (
    <>
      <button
        onClick={save}
        disabled={saving}
        className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#e5262b] text-[15px] font-bold disabled:opacity-60"
      >
        {saving ? "Creando imagen…" : "Guardar imagen de la solución"}
      </button>
      {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
    </>
  );
}
