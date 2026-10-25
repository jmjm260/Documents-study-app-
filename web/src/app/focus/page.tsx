"use client";

// Focus:
// 1) Lección obligatoria: tras resolver una tarea, mini lección (2–4 min) + prueba rápida. No se puede
//    saltar (tiempo mínimo por paso; la prueba acaba cuando aciertas todas). El chat queda bloqueado.
// 2) Mapa de cursos (estilo Duolingo): Tocorito arriba, una columna por curso con sus tareas, lecciones
//    y exámenes por fecha. Tocar un círculo abre sus acciones (repetir, ver, imagen, pedírsela a Tocorito…).
// 3) Pruebas de repaso: si anotas un examen de una clase con lecciones, Tocorito te deja una aquí (trofeo).
// Lo ya hecho (lecciones y repasos) se puede repetir igual, pero sin esperas: ya lo leíste una vez.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import CourseMap from "@/components/focus/CourseMap";
import CoursesSection from "@/components/focus/CoursesSection";
import { Center, FOCUS_TABS, FocusTabs, LessonStep, Quiz, Shell, StepCard, type FocusTab } from "@/components/focus/FocusParts";
import Sheet from "@/components/Sheet";
import { dayKey } from "@/lib/calendar";
import { sameCourse, stepSeconds } from "@/lib/focus";
import { buildCourseMap, type MapColumn, type MapItem, type MapNode } from "@/lib/focus-map";
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
  setChatPrefill,
  startReview,
  updateReview,
  type FocusState,
  type Review,
  type SavedLesson,
} from "@/lib/focus-store";
import { loadCanvasCache, loadEntries, loadHiddenCanvas, toCalendarItems } from "@/lib/entries";
import { saveSolutionImage } from "@/lib/solution-image";

const TAB_KEY = "tocorito.focus.tab";

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
  // Con una lección obligatoria pendiente se puede mirar el mapa, pero solo para volver a ella.
  const [mapWhilePending, setMapWhilePending] = useState(false);
  // Parte de Focus abierta (se recuerda en este dispositivo).
  const [tab, setTab] = useState<FocusTab>("escuela");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (FOCUS_TABS.some((t) => t.id === saved)) setTab(saved as FocusTab);
    } catch {
      // Sin almacenamiento: empieza en Escuela.
    }
  }, []);
  function chooseTab(next: FocusTab) {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Sin almacenamiento: dura mientras la pantalla esté abierta.
    }
  }

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

  // Hay una lección obligatoria pendiente: hasta terminarla, solo ella (o el mapa, que lleva de vuelta a ella).
  if (focus) {
    if (mapWhilePending) {
      return <MapHome section="todo" library={library} reviews={reviews} pending={focus} onOpenPending={() => setMapWhilePending(false)} setView={setView} />;
    }
    return (
      <MandatoryFocus
        focus={focus}
        onBack={() => setMapWhilePending(true)}
        onDone={(saved) => {
          setMapWhilePending(false);
          setView({ kind: "focusDone", saved, topic: focus.topic });
        }}
      />
    );
  }

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

  const tabs = <FocusTabs value={tab} onChange={chooseTab} />;
  if (tab === "cursos") return <CoursesSection tabs={tabs} />;
  return <MapHome section={tab} tabs={tabs} library={library} reviews={reviews} pending={null} onOpenPending={() => {}} setView={setView} />;
}

function MandatoryFocus({ focus, onBack, onDone }: { focus: FocusState; onBack: () => void; onDone: (saved: SavedLesson | null) => void }) {
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
      <Shell subtitle={`${focus.course} · ${focus.topic}`} onBack={onBack}>
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
    <Shell subtitle={`${focus.course} · ${focus.topic}`} progress={done / (lesson.steps.length + 1)} onBack={onBack}>
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

/** Lo del calendario (Canvas + anotaciones) que puede salir en el mapa. */
function loadMapItems(): MapItem[] {
  return toCalendarItems(loadCanvasCache(), loadEntries(), loadHiddenCanvas()).map((i) => ({
    id: i.id,
    kind: i.kind,
    title: i.title,
    day: i.day,
    course: i.course,
    source: i.source,
  }));
}

type SetView = (view: View) => void;

/**
 * Mapa de columnas. "escuela": clases que salen en el calendario/Canvas. "libre": lo demás.
 * "todo": con una lección obligatoria pendiente (sin pestañas: solo sirve para volver a ella).
 */
function MapHome({
  section,
  tabs,
  library,
  reviews,
  pending,
  onOpenPending,
  setView,
}: {
  section: "escuela" | "libre" | "todo";
  tabs?: React.ReactNode;
  library: SavedLesson[];
  reviews: Review[];
  pending: FocusState | null;
  onOpenPending: () => void;
  setView: SetView;
}) {
  const router = useRouter();
  const [items, setItems] = useState<MapItem[]>([]);
  useEffect(() => setItems(loadMapItems()), []);
  const [selected, setSelected] = useState<{ column: MapColumn; node: MapNode } | null>(null);

  const columns = useMemo(
    () =>
      buildCourseMap({
        lessons: library,
        reviews,
        pending: pending && { course: pending.course, topic: pending.topic, createdAt: pending.createdAt },
        items,
        today: dayKey(new Date()),
      }).filter((c) => section === "todo" || c.school === (section === "escuela")),
    [library, reviews, pending, items, section]
  );

  const subtitle = pending ? "Primero, tu lección pendiente" : section === "escuela" ? "Tus clases de la escuela" : "Lo que aprendes por tu cuenta";

  if (!columns.length) {
    return (
      <Shell subtitle={subtitle}>
        {tabs}
        <Center>
          <TocoritoFigure height={120} />
          {section === "escuela" ? (
            <>
              <h2 className="mt-4 text-xl font-extrabold tracking-tight">Tus clases saldrán aquí</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Conecta tu calendario de Canvas (o anota tareas y exámenes con su materia) y aquí verás cada clase con sus tareas y tus lecciones.
              </p>
              <button onClick={() => router.push("/calendario")} className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
                Ir al calendario
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-xl font-extrabold tracking-tight">Nada por aquí todavía</h2>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Cuando Tocorito te resuelva algo que no es de una clase ni de un curso, su lección sale aquí, agrupada por tema.
              </p>
            </>
          )}
        </Center>
      </Shell>
    );
  }

  return (
    <Shell subtitle={subtitle}>
      {tabs}
      <CourseMap
        columns={columns}
        onNode={(column, node) => (pending && node.type === "pending" ? onOpenPending() : setSelected({ column, node }))}
      />
      {selected && (
        <NodeSheet
          {...selected}
          library={library}
          locked={Boolean(pending)}
          onOpenPending={onOpenPending}
          setView={setView}
          onClose={() => setSelected(null)}
        />
      )}
    </Shell>
  );
}

/** Lo que se puede hacer con cada círculo del mapa. */
function NodeSheet({
  column,
  node,
  library,
  locked,
  onOpenPending,
  setView,
  onClose,
}: {
  column: MapColumn;
  node: MapNode;
  library: SavedLesson[];
  locked: boolean;
  onOpenPending: () => void;
  setView: SetView;
  onClose: () => void;
}) {
  const router = useRouter();
  const date = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${node.date}T12:00:00`));
  const primary = "min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold text-white";
  const secondary = "min-h-12 w-full rounded-xl border border-white/15 text-[15px] font-bold text-white";
  const go = (view: View) => {
    onClose();
    setView(view);
  };

  let body: React.ReactNode;
  if (locked) {
    // Con una lección obligatoria pendiente, el mapa solo lleva de vuelta a ella.
    body = (
      <>
        <p className="text-sm text-slate-400">Primero termina tu lección pendiente. Luego todo esto vuelve a estar disponible.</p>
        <button onClick={() => (onClose(), onOpenPending())} className={`${primary} mt-4`}>
          Ir a mi lección
        </button>
      </>
    );
  } else if (node.type === "lesson") {
    const saved = library.find((l) => l.id === node.id);
    body = (
      <div className="flex flex-col gap-2">
        <p className="mb-2 text-sm text-slate-400">Lección y mini test hechos. Puedes repetirlos las veces que quieras.</p>
        <button onClick={() => go({ kind: "practice", id: node.id, from: "home" })} className={primary}>
          Repetir lección y prueba
        </button>
        <button onClick={() => go({ kind: "lesson", id: node.id })} className={secondary}>
          Ver lección
        </button>
        {saved?.solution && <SaveImageButton lesson={saved} variant="sheet" />}
      </div>
    );
  } else if (node.type === "task") {
    body = (
      <>
        <p className="text-sm text-slate-400">
          Tocorito aún no la ha resuelto. Pídesela en el chat (con el enunciado o una foto) y luego te toca su mini lección.
        </p>
        <button
          onClick={() => {
            setChatPrefill(`Ayúdame con esta tarea de ${column.name}: "${node.title}" (para el ${node.date}). `);
            onClose();
            router.push("/");
          }}
          className={`${primary} mt-4`}
        >
          Pedírsela a Tocorito
        </button>
      </>
    );
  } else if (node.type === "exam") {
    const lessons = library.filter((l) => sameCourse(l.course, column.name)).length;
    body = node.reviewId ? (
      <>
        <p className="text-sm text-slate-400">
          {node.reviewDone ? "Ya hiciste este repaso. Puedes repetirlo cuando quieras." : "Tu prueba de repaso, hecha con tus lecciones de este curso."}
        </p>
        <button onClick={() => go({ kind: "review", id: node.reviewId! })} className={`${primary} mt-4`}>
          {node.reviewDone ? "Repetir repaso" : "Hacer repaso"}
        </button>
      </>
    ) : lessons ? (
      <>
        <p className="text-sm text-slate-400">
          Tienes {lessons === 1 ? "1 lección" : `${lessons} lecciones`} de este curso. Tocorito te prepara una prueba de repaso con{" "}
          {lessons === 1 ? "ella" : "ellas"}.
        </p>
        <button
          onClick={() => {
            const review = startReview(column.name, `${node.title}, ${node.date}`);
            if (review) go({ kind: "review", id: review.id });
          }}
          className={`${primary} mt-4`}
        >
          Preparar repaso
        </button>
      </>
    ) : (
      <p className="pb-2 text-sm text-slate-400">
        Aún no tienes lecciones de este curso. Cuando Tocorito te resuelva tareas de {column.name}, aquí tendrás tu repaso.
      </p>
    );
  }

  return (
    <Sheet title={node.title} onClose={onClose} dark>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: column.color }}>
        {column.name} · {date}
      </p>
      {body}
    </Sheet>
  );
}

/** "primary": botón rojo grande (al terminar el Focus). "sheet": botón secundario en la hoja de un círculo del mapa. */
function SaveImageButton({ lesson, variant }: { lesson: Pick<SavedLesson, "topic" | "task" | "solution">; variant: "primary" | "sheet" }) {
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
  if (variant === "sheet") {
    return (
      <>
        <button onClick={save} disabled={saving} className="min-h-12 w-full rounded-xl border border-white/15 text-[15px] font-bold text-white disabled:opacity-60">
          {saving ? "Creando imagen…" : "Guardar imagen de la solución"}
        </button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </>
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
