"use client";

// Parte "Cursos" de Focus: el estudiante le pide a Tocorito un curso sobre lo que quiere aprender y lo
// recorre como en Duolingo: unidades con un camino en zigzag, lecciones que se abren en orden y un
// trofeo (prueba de la unidad) al final de cada unidad. Las lecciones se generan al abrirlas.
import Link from "next/link";
import { useEffect, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import RichText from "@/components/RichText";
import Sheet from "@/components/Sheet";
import {
  COURSE_STEP_SECONDS,
  courseProgress,
  currentLesson,
  isUnitTestUnlocked,
  isUnlocked,
  LEVELS,
  type Course,
  type CourseLevel,
  type LessonRef,
} from "@/lib/courses";
import {
  completeCourseLesson,
  completeUnitTest,
  deleteCourse,
  ensureCourseLesson,
  ensureUnitTest,
  loadCourses,
  prefetchAhead,
  retryCourse,
  startCourseCreation,
} from "@/lib/courses-store";
import type { Lesson, QuizQuestion } from "@/lib/focus";
import { COURSE_COLORS } from "@/lib/focus-map";
import { FOCUS_EVENT } from "@/lib/focus-store";
import { Center, LessonStep, Quiz, Shell } from "./FocusParts";

type View =
  | { kind: "list" }
  | { kind: "course"; id: string }
  | { kind: "lesson"; id: string; ref: LessonRef }
  | { kind: "test"; id: string; unit: number }
  | { kind: "done"; id: string; title: string; text: string };

export default function CoursesSection({ tabs, openCourseId }: { tabs: React.ReactNode; openCourseId?: string | null }) {
  const [courses, setCourses] = useState<Course[]>([]);
  // Desde el chat ("Abrir"): Focus entra directo en ese curso.
  const [view, setView] = useState<View>(openCourseId ? { kind: "course", id: openCourseId } : { kind: "list" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const sync = () => setCourses(loadCourses());
    sync();
    window.addEventListener(FOCUS_EVENT, sync);
    return () => window.removeEventListener(FOCUS_EVENT, sync);
  }, []);

  const find = (id: string) => courses.find((c) => c.id === id);

  if (view.kind === "done") {
    return (
      <Shell>
        <Center>
          <TocoritoFigure height={140} sipping />
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">{view.title}</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">{view.text}</p>
          <button onClick={() => setView({ kind: "course", id: view.id })} className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
            Seguir con el curso
          </button>
        </Center>
      </Shell>
    );
  }

  if (view.kind === "lesson") {
    const course = find(view.id);
    if (course) {
      const item = course.units[view.ref.unit].lessons[view.ref.lesson];
      const wasDone = Boolean(item.doneAt);
      return (
        <LessonRunner
          key={`${view.ref.unit}-${view.ref.lesson}`}
          course={course}
          lessonRef={view.ref}
          onBack={() => setView({ kind: "course", id: course.id })}
          onDone={() => {
            completeCourseLesson(course.id, view.ref);
            setView({
              kind: "done",
              id: course.id,
              title: wasDone ? "Lección repetida" : "Lección completada",
              text: wasDone ? `${item.title}, otra vez. Ni yo repaso tanto. 🐦` : `${item.title}: hecho. Mira tú… la siguiente ya está abierta.`,
            });
          }}
        />
      );
    }
  }

  if (view.kind === "test") {
    const course = find(view.id);
    if (course) {
      const unit = course.units[view.unit];
      return (
        <UnitTestRunner
          key={view.unit}
          course={course}
          unit={view.unit}
          onBack={() => setView({ kind: "course", id: course.id })}
          onDone={() => {
            completeUnitTest(course.id, view.unit);
            setView({ kind: "done", id: course.id, title: "Unidad superada", text: `${unit.title}: aprobada. Si sigues así, hasta me vas a caer bien. 🏆` });
          }}
        />
      );
    }
  }

  if (view.kind === "course") {
    const course = find(view.id);
    // Mientras se crea (o si falló) se ve su tarjeta en la lista, no el camino.
    if (course && !course.status) {
      return (
        <CoursePath
          course={course}
          onBack={() => setView({ kind: "list" })}
          onLesson={(ref) => setView({ kind: "lesson", id: course.id, ref })}
          onTest={(unit) => setView({ kind: "test", id: course.id, unit })}
          onDelete={() => {
            deleteCourse(course.id);
            setView({ kind: "list" });
          }}
        />
      );
    }
  }

  return (
    <Shell subtitle="Lo que quieras aprender, con Tocorito">
      {tabs}
      {/* Entrenamiento especial: SAT Reading and Writing (módulo propio con reinicios y cronómetro). */}
      <Link href="/sat" className="mb-3 flex items-center gap-3 rounded-2xl border border-[#e5262b]/50 bg-[#e5262b]/10 p-4 active:bg-[#e5262b]/20">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e5262b] text-sm font-extrabold">SAT</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">SAT Reading and Writing</span>
          <span className="block text-xs text-red-100/80">Lecciones cortas, repasos y desafío de velocidad. Un error: nivel 1.</span>
        </span>
        <span className="text-sm font-bold">Entrar</span>
      </Link>
      {courses.length === 0 ? (
        <Center>
          <TocoritoFigure height={120} />
          <h2 className="mt-4 text-xl font-extrabold tracking-tight">Aprende lo que quieras</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-400">
            Dile a Tocorito qué quieres aprender (Python, guitarra, finanzas, chino…) y te arma un curso por unidades, como en Duolingo.
          </p>
          <button onClick={() => setCreating(true)} className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
            Crear mi primer curso
          </button>
        </Center>
      ) : (
        <div className="flex flex-col gap-3">
          {courses.map((c, i) => {
            if (c.status) return <PendingCourseCard key={c.id} course={c} />;
            const p = courseProgress(c);
            const color = COURSE_COLORS[i % COURSE_COLORS.length];
            return (
              <button
                key={c.id}
                onClick={() => setView({ kind: "course", id: c.id })}
                className="rounded-2xl border border-white/10 p-4 text-left active:bg-white/5"
              >
                <div className="flex items-center gap-3">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{c.title}</p>
                    <p className="text-xs text-slate-400">
                      {c.level.charAt(0).toUpperCase() + c.level.slice(1)} · {p.done} de {p.total} lecciones
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#6ea0ff]">{p.done === p.total ? "Repasar" : p.done ? "Seguir" : "Empezar"}</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${(p.done / p.total) * 100}%`, background: color }} />
                </div>
              </button>
            );
          })}
          <button onClick={() => setCreating(true)} className="min-h-12 rounded-xl border border-dashed border-white/25 text-[15px] font-bold text-slate-200 active:bg-white/5">
            + Nuevo curso
          </button>
        </div>
      )}
      {creating && <NewCourseSheet onClose={() => setCreating(false)} />}
    </Shell>
  );
}

/** Tarjeta de un curso que se está creando, que falló o que Tocorito rechazó. */
function PendingCourseCard({ course }: { course: Course }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 p-4" role="status">
      <TocoritoFigure height={56} sipping={course.status === "creating"} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{course.title}</p>
        {course.status === "creating" ? (
          <p className="text-xs text-slate-400">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#f59e0b] align-middle" />
            Tocorito investiga cómo aprenderlo y arma tu curso…
          </p>
        ) : (
          <p className="text-xs text-slate-300">{course.note ?? "No pude crear el curso."}</p>
        )}
        {course.status !== "creating" && (
          <div className="mt-2 flex gap-2">
            {course.status === "failed" && (
              <button onClick={() => retryCourse(course.id)} className="min-h-9 rounded-lg bg-[#1450d8] px-3 text-sm font-bold">
                Reintentar
              </button>
            )}
            <button onClick={() => deleteCourse(course.id)} className="min-h-9 rounded-lg border border-white/15 px-3 text-sm font-bold text-slate-300">
              Quitar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Pide el curso y se cierra al momento: Tocorito investiga y lo arma en segundo plano. */
function NewCourseSheet({ onClose }: { onClose: () => void }) {
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<CourseLevel>("principiante");
  const [message, setMessage] = useState<string | null>(null);

  function create() {
    if (topic.trim().length < 3) {
      setMessage("Dime un poco más de qué quieres aprender.");
      return;
    }
    startCourseCreation({ topic: topic.trim(), level, goal: goal.trim() || undefined });
    onClose();
  }

  return (
    <Sheet title="Nuevo curso" onClose={onClose} dark>
      <label className="text-sm font-semibold text-slate-300" htmlFor="course-topic">
        ¿Qué quieres aprender?
      </label>
      <textarea
        id="course-topic"
        value={topic}
        onChange={(e) => {
          setTopic(e.target.value);
          setMessage(null);
        }}
        maxLength={160}
        rows={2}
        placeholder="Programar en Python desde cero"
        className="mt-2 w-full resize-none rounded-xl border border-white/15 bg-[#161618] px-3 py-2.5 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-[#1450d8]"
      />
      <label className="mt-4 block text-sm font-semibold text-slate-300" htmlFor="course-goal">
        ¿Para qué lo quieres? <span className="font-normal text-slate-500">(opcional)</span>
      </label>
      <input
        id="course-goal"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        maxLength={200}
        placeholder="Hacer mi primer videojuego"
        className="mt-2 min-h-11 w-full rounded-xl border border-white/15 bg-[#161618] px-3 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-[#1450d8]"
      />
      <p className="mt-4 text-sm font-semibold text-slate-300">Nivel</p>
      <div className="mt-2 flex rounded-xl bg-[#161618] p-1">
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            aria-pressed={level === l}
            className={`min-h-10 flex-1 rounded-lg text-sm font-semibold capitalize ${level === l ? "bg-[#1450d8] text-white" : "text-slate-400"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {message && <p className="mt-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200">{message}</p>}
      <p className="mt-4 text-xs text-slate-500">Tocorito primero investiga cómo aprenderlo para tu objetivo. Tarda un poco: puedes seguir usando la app.</p>
      <button onClick={create} className="mb-2 mt-3 min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold text-white">
        Crear curso
      </button>
    </Sheet>
  );
}

// Desplazamiento de cada círculo para el zigzag (en px), como el camino de Duolingo.
const ZIGZAG = [0, 44, 66, 44, 0, -44, -66, -44];

function CoursePath({
  course,
  onBack,
  onLesson,
  onTest,
  onDelete,
}: {
  course: Course;
  onBack: () => void;
  onLesson: (ref: LessonRef) => void;
  onTest: (unit: number) => void;
  onDelete: () => void;
}) {
  const current = currentLesson(course);
  const p = courseProgress(course);
  let step = 0;
  // Si la lección que toca aún no existe (p. ej. falló antes), se prepara ya, mientras mira el camino.
  useEffect(() => {
    if (current && !course.units[current.unit].lessons[current.lesson].lesson) ensureCourseLesson(course, current).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- al abrir el curso o cambiar la lección actual
  }, [course.id, current?.unit, current?.lesson]);
  // Tocorito toma café de vez en cuando junto a la lección que toca.
  const [sipping, setSipping] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setSipping(true);
      setTimeout(() => setSipping(false), 1900);
    }, 9000);
    return () => clearInterval(id);
  }, []);
  return (
    <Shell subtitle={`${course.title} · ${p.done} de ${p.total}`} progress={p.done / p.total} onBack={onBack}>
      {(course.goal || course.plan) && (
        // La investigación de Tocorito: cómo pensó llegar al objetivo (plegada para no tapar el camino).
        <details className="mb-5 rounded-2xl border border-white/10 px-4 py-3">
          <summary className="flex min-h-8 cursor-pointer items-center justify-between text-sm font-bold">
            Plan de Tocorito
            {course.goal && <span className="ml-3 truncate text-xs font-normal text-slate-400">Meta: {course.goal}</span>}
          </summary>
          {course.plan && <PlanText text={course.plan} />}
        </details>
      )}
      {course.units.map((unit, ui) => {
        const color = COURSE_COLORS[ui % COURSE_COLORS.length];
        const testOpen = isUnitTestUnlocked(course, ui);
        return (
          <section key={ui} className="mb-6">
            <div className="rounded-2xl px-4 py-3" style={{ background: color }}>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Unidad {ui + 1}</p>
              <p className="font-bold leading-snug">{unit.title}</p>
            </div>
            <div className="flex flex-col items-center pt-4">
              {unit.lessons.map((l, li) => {
                const ref = { unit: ui, lesson: li };
                const done = Boolean(l.doneAt);
                const isCurrent = current?.unit === ui && current.lesson === li;
                const open = isUnlocked(course, ref);
                const x = ZIGZAG[step++ % ZIGZAG.length];
                return (
                  <div key={li} className="relative mb-3 flex flex-col items-center" style={{ transform: `translateX(${x}px)` }}>
                    {/* Tocorito acompaña la lección que toca, del lado contrario al zigzag (como el búho de Duolingo). */}
                    {isCurrent && (
                      <div className={`pointer-events-none absolute top-2 ${x > 0 ? "right-full mr-4" : "left-full ml-4"}`}>
                        <TocoritoFigure height={84} sipping={sipping} />
                      </div>
                    )}
                    {isCurrent && <span className="mb-1 rounded-lg bg-white px-2 py-0.5 text-xs font-bold text-[#0b1840]">{done ? "Repasar" : "Empezar"}</span>}
                    <button
                      onClick={() => open && onLesson(ref)}
                      disabled={!open}
                      aria-label={`${l.title}: ${done ? "hecha" : open ? "disponible" : "bloqueada"}`}
                      className="flex h-16 w-16 items-center justify-center rounded-full transition active:scale-95"
                      style={
                        done
                          ? { background: color }
                          : isCurrent
                            ? { background: "#e5262b", boxShadow: "0 0 0 5px #000, 0 0 0 8px #e5262b" }
                            : { background: "#27272a", color: "#71717a" }
                      }
                    >
                      <PathIcon icon={done ? "check" : isCurrent ? "play" : "lock"} />
                    </button>
                    <p className={`mt-1 max-w-[150px] text-center text-xs leading-tight ${open ? "text-slate-200" : "text-slate-500"}`}>{l.title}</p>
                  </div>
                );
              })}
              {/* Trofeo: prueba de la unidad */}
              <div className="flex flex-col items-center" style={{ transform: `translateX(${ZIGZAG[step++ % ZIGZAG.length]}px)` }}>
                <button
                  onClick={() => testOpen && onTest(ui)}
                  disabled={!testOpen}
                  aria-label={`Prueba de la unidad ${ui + 1}: ${unit.test.doneAt ? "aprobada" : testOpen ? "disponible" : "bloqueada"}`}
                  className="flex h-16 w-16 items-center justify-center rounded-full transition active:scale-95"
                  style={
                    unit.test.doneAt
                      ? { background: color }
                      : testOpen
                        ? { background: "#b45309", boxShadow: "0 0 0 5px #000, 0 0 0 8px #b45309" }
                        : { background: "#27272a", color: "#71717a" }
                  }
                >
                  <PathIcon icon="trophy" />
                </button>
                <p className={`mt-1 text-xs ${testOpen ? "text-slate-200" : "text-slate-500"}`}>Prueba de la unidad</p>
              </div>
            </div>
          </section>
        );
      })}
      <button
        onClick={() => window.confirm(`¿Borrar el curso "${course.title}"? Se pierde tu progreso.`) && onDelete()}
        className="mx-auto mb-2 min-h-11 text-sm text-slate-500 active:text-red-300"
      >
        Borrar curso
      </button>
    </Shell>
  );
}

/** El plan llega en Markdown sencillo: "# Título" como encabezado, y **negrita** / listas tal cual. */
function PlanText({ text }: { text: string }) {
  return (
    <div className="mt-2 text-sm leading-relaxed text-slate-300">
      {text.split("\n").map((line, i) => {
        const heading = /^#{1,4}\s+(.*)$/.exec(line.trim());
        if (heading) return <p key={i} className="mt-3 font-bold text-white first:mt-0">{heading[1]}</p>;
        if (!line.trim()) return null;
        return (
          <p key={i} className="mt-1 whitespace-pre-wrap break-words">
            <RichText text={line} />
          </p>
        );
      })}
    </div>
  );
}

/** Abre (o genera la primera vez) una lección del curso: pasos sin espera y su mini test. */
function LessonRunner({ course, lessonRef, onBack, onDone }: { course: Course; lessonRef: LessonRef; onBack: () => void; onDone: () => void }) {
  const item = course.units[lessonRef.unit].lessons[lessonRef.lesson];
  const [lesson, setLesson] = useState<Lesson | null>(item.lesson);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<"lesson" | "quiz">("lesson");
  const [passed, setPassed] = useState<number[]>([]);

  useEffect(() => {
    if (lesson || error) return;
    ensureCourseLesson(course, lessonRef)
      .then(setLesson)
      .catch((err) => setError(err instanceof Error ? err.message : "No pude preparar la lección."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir la lección o al reintentar
  }, [lesson, error]);

  // En cuanto esta lección está en pantalla, Tocorito prepara en segundo plano la siguiente (y la prueba de la unidad).
  const ready = Boolean(lesson);
  useEffect(() => {
    if (ready) prefetchAhead(course.id, lessonRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por lección
  }, [ready]);

  const subtitle = `${course.title} · ${item.title}`;
  if (!lesson) {
    return (
      <Shell subtitle={subtitle} onBack={onBack}>
        <Waiting error={error} onRetry={() => setError(null)} label="Tocorito está preparando la lección…" />
      </Shell>
    );
  }
  const done = phase === "quiz" ? lesson.steps.length : step;
  return (
    <Shell subtitle={subtitle} progress={done / (lesson.steps.length + 1)} onBack={onBack}>
      {phase === "lesson" ? (
        <LessonStep
          key={step}
          index={step}
          count={lesson.steps.length}
          title={lesson.title}
          step={lesson.steps[step]}
          // La primera vez, 20 s por explicación para leerla con calma (y Tocorito prepara lo siguiente).
          // Al repetir una lección ya hecha, sin espera. Las preguntas nunca esperan.
          seconds={item.doneAt ? 0 : COURSE_STEP_SECONDS}
          onNext={() => (step + 1 < lesson.steps.length ? setStep(step + 1) : setPhase("quiz"))}
        />
      ) : (
        <Quiz
          label="Mini test"
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

function UnitTestRunner({ course, unit, onBack, onDone }: { course: Course; unit: number; onBack: () => void; onDone: () => void }) {
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(course.units[unit].test.quiz);
  const [error, setError] = useState<string | null>(null);
  const [passed, setPassed] = useState<number[]>([]);

  useEffect(() => {
    if (quiz || error) return;
    ensureUnitTest(course, unit)
      .then(setQuiz)
      .catch((err) => setError(err instanceof Error ? err.message : "No pude preparar la prueba."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir la prueba o al reintentar
  }, [quiz, error]);

  const subtitle = `${course.title} · Prueba de la unidad ${unit + 1}`;
  if (!quiz) {
    return (
      <Shell subtitle={subtitle} onBack={onBack}>
        <Waiting error={error} onRetry={() => setError(null)} label="Tocorito está preparando la prueba…" />
      </Shell>
    );
  }
  return (
    <Shell subtitle={subtitle} progress={passed.length / quiz.length} onBack={onBack}>
      <Quiz
        label="Prueba de la unidad"
        questions={quiz}
        passed={passed}
        onPass={(i) => {
          const next = [...passed, i];
          if (next.length >= quiz.length) onDone();
          else setPassed(next);
        }}
      />
    </Shell>
  );
}

function Waiting({ error, onRetry, label }: { error: string | null; onRetry: () => void; label: string }) {
  return (
    <Center>
      <TocoritoFigure height={130} sipping={!error} />
      {error ? (
        <>
          <p className="mt-4 max-w-sm text-sm text-red-300">{error}</p>
          <button onClick={onRetry} className="mt-4 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
            Intentar otra vez
          </button>
        </>
      ) : (
        <h2 className="mt-4 text-xl font-extrabold tracking-tight">{label}</h2>
      )}
    </Center>
  );
}

function PathIcon({ icon }: { icon: "check" | "play" | "lock" | "trophy" }) {
  const paths = {
    check: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />,
    play: <path strokeLinejoin="round" d="M8 5.5v13l10.5-6.5L8 5.5z" />,
    lock: (
      <>
        <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
        <path strokeLinecap="round" d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      </>
    ),
    trophy: (
      <>
        <path strokeLinejoin="round" d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0v-5z" />
        <path strokeLinecap="round" d="M7.5 6.5H5a2.5 2.5 0 0 0 2.6 3.5M16.5 6.5H19a2.5 2.5 0 0 1-2.6 3.5M12 14v3.5M8.5 19.5h7" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      {paths[icon]}
    </svg>
  );
}
