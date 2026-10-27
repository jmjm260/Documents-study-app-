"use client";

// Entrenamiento SAT Reading and Writing con Tocorito (estilo SoloLearn: explicación pequeña + pregunta).
// Una sola tarea visible a la vez. El servidor decide todo (claves, tiempo, reinicios); aquí solo se muestra.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import RichText from "@/components/RichText";
import MiniMarkdown from "@/components/sat/MiniMarkdown";
import SatChart from "@/components/sat/SatChart";
import Sheet from "@/components/Sheet";
import { EXTREME_MINUTES } from "@/lib/sat/config";
import { FAMILIES, FAMILY_BY_ID } from "@/lib/sat/curriculum";
import type { OptionId, PublicItem } from "@/lib/sat/items";
import type { SatView } from "@/lib/server/sat-service";

type Feedback = { status: "correct"; explanation: string | null; roundComplete: boolean; advance?: "level" | "time" | "time-floor" };

const PHASE_LABEL = { aprendizaje: "Aprendizaje", dificultad: "Dificultad creciente", velocidad: "Desafío de velocidad" } as const;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function api(body?: object): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch("/api/sat", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

export default function SatPage() {
  const router = useRouter();
  const [view, setView] = useState<SatView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<OptionId | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [report, setReport] = useState<{ itemId: string; contest: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // El mismo "nonce" si hay que reintentar por un fallo de red: el servidor no lo cuenta dos veces.
  const nonce = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api();
      if (!r.ok) throw new Error((r.data.error as string) ?? "No pude cargar.");
      setView(r.data as unknown as SatView);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Problema de conexión (no cuenta como error).");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mientras se prepara algo, consultar de vez en cuando.
  const waiting = view && !view.failure && !feedback && (!view.slide?.ready || (view.round.requiresFullReserve && !view.round.started));
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [waiting, load]);

  async function post(body: object) {
    setBusy(true);
    try {
      const r = await api(body);
      if (r.status === 409) {
        await load(); // otra pestaña o doble clic: se resincroniza, sin castigo
        return null;
      }
      if (!r.ok) throw new Error((r.data.error as string) ?? "Problema técnico (no cuenta como error).");
      return r.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Problema de conexión (no cuenta como error).");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function revealCurrent() {
    if (!view?.slide) return;
    const data = await post({ action: "reveal", roundId: view.round.id, position: view.round.position });
    if (data) setView(data as unknown as SatView);
    setSelected(null);
    nonce.current = null;
  }

  // Los repasos van directos a la pregunta (sin explicación previa).
  const autoReveal = view?.slide?.kind === "review" && view.slide.ready && !view.slide.revealed && view.round.started && !view.failure && !feedback;
  useEffect(() => {
    if (autoReveal && !busy) void revealCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- al llegar a un repaso
  }, [autoReveal, view?.round.position, view?.round.id]);

  async function confirm() {
    if (!view?.slide?.item || !selected) return;
    nonce.current ??= crypto.randomUUID();
    const data = await post({ action: "answer", roundId: view.round.id, position: view.round.position, choice: selected, nonce: nonce.current });
    if (!data) return;
    nonce.current = null;
    if (data.status === "correct") {
      const fb = data as unknown as Feedback;
      // En velocidad: feedback mínimo y a la siguiente sin esperas (el detalle queda para después).
      if (view.phase === "velocidad" && !fb.roundComplete) {
        setSelected(null);
        await load();
        return;
      }
      setFeedback(fb);
    } else {
      setSelected(null);
      await load(); // la pantalla de reinicio llega con el estado
    }
  }

  async function next() {
    setFeedback(null);
    setSelected(null);
    await load();
  }

  // Reloj: el servidor manda cuánto queda; aquí solo se descuenta para mostrarlo. Si llega a 0, el servidor decide.
  const [now, setNow] = useState(() => Date.now());
  const loadedAt = useRef(Date.now());
  useEffect(() => {
    loadedAt.current = Date.now();
  }, [view]);
  const counting = Boolean(view?.slide?.revealed && !feedback && !view.failure);
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [counting]);
  const remaining = view ? view.round.remainingMs - (counting ? now - loadedAt.current : 0) : 0;
  const expired = counting && remaining <= 0;
  useEffect(() => {
    if (expired) void load();
  }, [expired, load]);

  // Teclado: A–D o 1–4 para elegir, Enter para confirmar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!view?.slide?.item || feedback || report) return;
      const k = e.key.toUpperCase();
      const idx = "ABCD".indexOf(k) >= 0 ? "ABCD".indexOf(k) : "1234".indexOf(k);
      if (idx >= 0 && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) setSelected("ABCD"[idx] as OptionId);
      if (e.key === "Enter" && selected) void confirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!view) {
    return (
      <Frame onBack={() => router.push("/focus")}>
        <Center>
          {error ? <ErrorBox text={error} onRetry={load} /> : <TocoritoFigure height={110} sipping />}
        </Center>
      </Frame>
    );
  }

  const r = view.round;
  const slide = view.slide;
  const header = (
    <StatusBar view={view} remaining={counting ? remaining : null} onMetrics={() => setShowMetrics(true)} />
  );

  let body: React.ReactNode;
  if (view.failure) {
    body = <FailureScreen view={view} busy={busy} onAck={async () => { const d = await post({ action: "ack" }); if (d) setView(d as unknown as SatView); }} onContest={() => view.failure?.item && setReport({ itemId: view.failure.item.id, contest: true })} />;
  } else if (feedback) {
    body = <FeedbackPanel feedback={feedback} view={view} onNext={next} />;
  } else if (r.requiresFullReserve && !r.started) {
    body = (
      <Center>
        <TocoritoFigure height={110} sipping={r.ready < r.size} />
        <h2 className="mt-4 text-xl font-extrabold">Ronda cronometrada</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          {r.size} preguntas · {mmss(r.budgetMs)} en total para responder · dificultad {r.difficulty}/8. Sin lecciones durante el cronómetro.
        </p>
        <div className="mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[#1450d8] transition-all" style={{ width: `${(r.ready / r.size) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {r.ready < r.size ? `Tocorito prepara y revisa las preguntas: ${r.ready}/${r.size}` : "Todo listo y revisado."}
        </p>
        <button
          disabled={r.ready < r.size || busy}
          onClick={async () => {
            const d = await post({ action: "start", roundId: r.id });
            if (d) setView(d as unknown as SatView);
          }}
          className="mt-5 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold disabled:bg-white/10 disabled:text-slate-500"
        >
          Empezar ronda
        </button>
      </Center>
    );
  } else if (!slide || !slide.ready) {
    body = (
      <Center>
        <TocoritoFigure height={110} sipping />
        <h2 className="mt-4 text-lg font-extrabold">Preparando tu {slide?.kind === "intro" ? "lección" : "pregunta"}…</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          Tocorito la escribe, otra revisión la resuelve sin ver la respuesta, y solo entonces te la da. Nunca repite una que ya viste.
        </p>
      </Center>
    );
  } else if (!slide.revealed) {
    body =
      slide.kind === "intro" && slide.lesson ? (
        <div className="flex flex-1 flex-col">
          {view.metrics.answered === 0 && r.position === 0 && <HowItWorks />}
          <Badge text="Concepto nuevo" tone="blue" />
          <h2 className="mt-2 text-lg font-extrabold leading-snug">{slide.lesson.title}</h2>
          <div className="mt-3 rounded-2xl border border-white/15 px-4 py-3">
            <MiniMarkdown text={slide.lesson.body} />
          </div>
          <p className="mt-3 text-xs text-slate-500">Lee con calma: el tiempo de la pregunta empieza al pulsar el botón.</p>
          <div className="mt-auto flex items-end gap-3 pt-5">
            <TocoritoFigure height={60} />
            <button onClick={revealCurrent} disabled={busy} className="min-h-12 flex-1 rounded-xl bg-[#1450d8] text-[15px] font-bold disabled:opacity-60">
              Empezar pregunta
            </button>
          </div>
        </div>
      ) : (
        <Center>
          <TocoritoFigure height={90} sipping />
        </Center>
      );
  } else if (slide.item) {
    body = (
      <QuestionView
        item={slide.item}
        kind={slide.kind}
        selected={selected}
        onSelect={setSelected}
        onConfirm={confirm}
        busy={busy}
        onReport={() => setReport({ itemId: slide.item!.id, contest: false })}
      />
    );
  }

  return (
    <Frame onBack={() => router.push("/focus")} header={header}>
      {view.notice && <p className="mb-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{view.notice}</p>}
      {error && <ErrorBox text={error} onRetry={() => (setError(null), load())} />}
      {message && (
        <p className="mb-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200" role="status">
          {message}
        </p>
      )}
      {body}
      {showMetrics && <MetricsSheet view={view} onClose={() => setShowMetrics(false)} />}
      {report && (
        <ReportSheet
          contest={report.contest}
          onClose={() => setReport(null)}
          onSend={async (reason) => {
            const d = await post({ action: "report", itemId: report.itemId, reason, contest: report.contest });
            setReport(null);
            if (d) {
              setMessage(d.message as string);
              if (d.view) setView(d.view as SatView);
              setSelected(null);
            }
          }}
        />
      )}
    </Frame>
  );
}

function Frame({ onBack, header, children }: { onBack: () => void; header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-black font-sans text-white">
      <div className="flex h-1 shrink-0">
        <div className="flex-1 bg-[#1450d8]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>
      <header className="shrink-0 border-b border-white/10 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button onClick={onBack} aria-label="Volver a Focus" className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-200 active:bg-white/10">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold leading-tight tracking-tight">SAT Reading and Writing</h1>
            <p className="text-xs text-slate-400">Entrenamiento de Tocorito · no es un simulacro oficial</p>
          </div>
        </div>
        {header && <div className="mx-auto mt-2 max-w-2xl">{header}</div>}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto [color-scheme:dark]">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-4 sm:px-6">{children}</div>
      </main>
    </div>
  );
}

function StatusBar({ view, remaining, onMetrics }: { view: SatView; remaining: number | null; onMetrics: () => void }) {
  const r = view.round;
  const covered = new Set(r.covered);
  const low = remaining !== null && remaining < (r.timeMode === "global" ? 60_000 : 15_000);
  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-md bg-white/10 px-2 py-1 font-bold">Nivel {view.level}</span>
        <span className="text-slate-300">{PHASE_LABEL[view.phase] ?? view.phase}</span>
        <span className="text-slate-500">·</span>
        <span className="tabular-nums text-slate-300">
          {Math.min(r.position + 1, r.size)}/{r.size}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {remaining !== null && (
            <span className={`rounded-md px-2 py-1 font-bold tabular-nums ${low ? "bg-red-500/20 text-red-200" : "bg-white/10"}`} aria-live="off">
              {r.timeMode === "global" ? "Ronda " : ""}
              {mmss(remaining)}
            </span>
          )}
          <button onClick={onMetrics} className="min-h-9 rounded-lg border border-white/15 px-2.5 font-semibold text-slate-200 active:bg-white/10">
            Progreso
          </button>
        </span>
      </div>
      {/* Cobertura de la ronda: las 11 familias (se marcan al acertar una pregunta de cada una). */}
      <div className="mt-2 flex gap-1" aria-label={`Cobertura de la ronda: ${covered.size} de ${FAMILIES.length} familias`}>
        {FAMILIES.map((f) => (
          <span
            key={f.id}
            title={`${f.id}. ${f.name}`}
            className={`h-1.5 flex-1 rounded-full ${covered.has(f.id) ? "bg-emerald-400" : "bg-white/10"}`}
          />
        ))}
      </div>
    </div>
  );
}

function QuestionView({
  item,
  kind,
  selected,
  onSelect,
  onConfirm,
  busy,
  onReport,
}: {
  item: PublicItem;
  kind: "intro" | "review";
  selected: OptionId | null;
  onSelect: (id: OptionId) => void;
  onConfirm: () => void;
  busy: boolean;
  onReport: () => void;
}) {
  const fam = FAMILY_BY_ID.get(item.family);
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2">
        <Badge text={kind === "intro" ? "Pregunta del concepto" : "Repaso"} tone={kind === "intro" ? "blue" : "gray"} />
        <span className="truncate text-xs text-slate-500">{fam?.name}</span>
      </div>
      <div className="mt-3 rounded-2xl border border-white/15 px-4 py-3 text-[15px] leading-relaxed" lang="en">
        {item.passage2 && <p className="mb-1 text-xs font-bold uppercase text-slate-400">Text 1</p>}
        <p className="whitespace-pre-wrap break-words">{item.passage}</p>
        {item.passage2 && (
          <>
            <p className="mb-1 mt-3 text-xs font-bold uppercase text-slate-400">Text 2</p>
            <p className="whitespace-pre-wrap break-words">{item.passage2}</p>
          </>
        )}
        {item.chart && <SatChart chart={item.chart} />}
      </div>
      <p className="mt-3 font-semibold leading-snug" lang="en">
        {item.question}
      </p>
      <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Opciones" lang="en">
        {item.options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={selected === o.id}
            onClick={() => onSelect(o.id)}
            className={`flex min-h-12 items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-[15px] transition ${
              selected === o.id ? "border-[#6ea0ff] bg-[#1450d8]/25" : "border-white/20 active:bg-white/10"
            }`}
          >
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected === o.id ? "bg-[#6ea0ff] text-black" : "bg-white/10"}`}>
              {o.id}
            </span>
            <span className="break-words">
              <RichText text={o.text} />
            </span>
          </button>
        ))}
      </div>
      <div className="mt-auto pt-5">
        {/* Elegir no envía: hay que confirmar (una pulsación accidental no cuenta). */}
        <button onClick={onConfirm} disabled={!selected || busy} className="min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold disabled:bg-white/10 disabled:text-slate-500">
          {busy ? "Enviando…" : selected ? `Confirmar ${selected}` : "Elige una respuesta"}
        </button>
        <button onClick={onReport} className="mx-auto mt-2 block min-h-10 text-xs text-slate-500 underline-offset-2 active:text-slate-300">
          Reportar pregunta defectuosa
        </button>
      </div>
    </div>
  );
}

function FeedbackPanel({ feedback, view, onNext }: { feedback: Feedback; view: SatView; onNext: () => void }) {
  if (feedback.roundComplete) {
    const text =
      feedback.advance === "time"
        ? `¡Ronda perfecta! El cronómetro baja a ${EXTREME_MINUTES[view.timeStep ?? 0] ?? 1} min para 50 preguntas. Misma dificultad, preguntas nuevas.`
        : feedback.advance === "time-floor"
          ? "50/50 en 60 segundos totales. Lo anoté como logro. El límite se queda en 60 s: puedes seguir con rondas nuevas."
          : `Ronda superada sin errores. Subes al nivel ${view.level}: un poco más exigente.`;
    return (
      <Center>
        <TocoritoFigure height={140} sipping />
        <h2 className="mt-4 text-2xl font-extrabold">Ronda superada</h2>
        <p className="mt-2 max-w-sm text-sm text-slate-300">{text}</p>
        <button onClick={onNext} className="mt-6 min-h-12 w-full max-w-xs rounded-xl bg-[#1450d8] text-[15px] font-bold">
          Siguiente ronda
        </button>
      </Center>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-lg font-extrabold text-emerald-300">Correcto</p>
      {feedback.explanation && (
        <div className="mt-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm leading-relaxed text-slate-200">
          <RichText text={feedback.explanation} />
        </div>
      )}
      <button onClick={onNext} autoFocus className="mt-auto min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold">
        Siguiente
      </button>
    </div>
  );
}

function FailureScreen({ view, busy, onAck, onContest }: { view: SatView; busy: boolean; onAck: () => void; onContest: () => void }) {
  const f = view.failure!;
  const it = f.item;
  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-xl font-extrabold">Vuelves al nivel 1</h2>
      <p className="mt-1 text-sm text-slate-400">
        {f.reason === "timeout" ? "Se acabó el tiempo de esta pregunta." : "Esta respuesta no era la correcta."} Era la pregunta {f.position + 1} del nivel{" "}
        {f.level}. Lo que has aprendido y tu historial se conservan; las preguntas serán nuevas.
      </p>
      {it && (
        <div className="mt-4 rounded-2xl border border-white/15 px-4 py-3 text-sm leading-relaxed">
          <p className="whitespace-pre-wrap" lang="en">
            {it.passage}
          </p>
          {it.passage2 && (
            <p className="mt-2 whitespace-pre-wrap" lang="en">
              {it.passage2}
            </p>
          )}
          {it.chart && <SatChart chart={it.chart} />}
          <p className="mt-2 font-semibold" lang="en">
            {it.question}
          </p>
          <ul className="mt-2 flex flex-col gap-1" lang="en">
            {it.options.map((o) => (
              <li
                key={o.id}
                className={`rounded-lg px-2 py-1 ${o.id === it.correct ? "bg-emerald-500/15 text-emerald-100" : o.id === f.choice ? "bg-red-500/15 text-red-100" : "text-slate-400"}`}
              >
                <b>{o.id}.</b> {o.text}
                {o.id === it.correct ? " ✓" : o.id === f.choice ? " (tu respuesta)" : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-white/10 pt-3 text-slate-200">
            <p className="font-bold">Por qué es {it.correct}</p>
            <RichText text={it.explanation} />
            {f.choice && it.distractors[f.choice] && (
              <p className="mt-2">
                <b>Por qué no {f.choice}:</b> <RichText text={it.distractors[f.choice]!} />
              </p>
            )}
            <p className="mt-2 text-slate-400">
              <b>Regla / evidencia:</b> <RichText text={it.verification} />
            </p>
          </div>
        </div>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-5">
        <button onClick={onAck} disabled={busy} className="min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold">
          Empezar de nuevo
        </button>
        {it && (
          <button onClick={onContest} disabled={busy} className="min-h-11 text-sm text-slate-400 active:text-white">
            Creo que la pregunta está mal (revisarla)
          </button>
        )}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <details className="mb-4 rounded-2xl border border-white/10 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-bold">Cómo funciona</summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-slate-300">
        <li>Concepto nuevo: lees una explicación corta y luego respondes su pregunta. Después vienen repasos con preguntas distintas.</li>
        <li>Eliges y confirmas. Tienes 60 s por pregunta (leer la explicación no cuenta).</li>
        <li>Un solo error (o quedarte sin tiempo) te devuelve al nivel 1, con preguntas nuevas. Tu historial se conserva.</li>
        <li>Cada ronda cubre las 11 familias del SAT y sube un poco la dificultad. Las de 50 tienen un cronómetro total.</li>
        <li>Tras dominar rondas de 50 muy difíciles, el tiempo total baja hasta 60 s. Es un desafío de Tocorito: no predice tu puntuación.</li>
      </ul>
    </details>
  );
}

function MetricsSheet({ view, onClose }: { view: SatView; onClose: () => void }) {
  const m = view.metrics;
  const weak = [...m.micros].filter((x) => x.attempts > 0).sort((a, b) => a.correct / a.attempts - b.correct / b.attempts).slice(0, 6);
  return (
    <Sheet title="Tu progreso" onClose={onClose} dark>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        <Stat label="Mejor nivel" value={String(m.best.level)} />
        <Stat label="Mejor tiempo (50)" value={m.best.timeStep === null ? "—" : `${EXTREME_MINUTES[m.best.timeStep]} min`} />
        <Stat label="Rondas perfectas" value={String(m.roundsPassed)} />
        <Stat label="Respondidas" value={`${m.correct}/${m.answered}`} />
        <Stat label="Reinicios" value={String(m.resets)} />
        <Stat label="Preguntas vistas" value={String(m.seen)} />
      </div>
      <h3 className="mt-4 text-sm font-bold">Precisión por familia</h3>
      <div className="mt-2 flex flex-col gap-1.5">
        {m.families.map((f) => {
          const pct = f.attempts ? Math.round((f.correct / f.attempts) * 100) : null;
          return (
            <div key={f.id} className="text-xs">
              <div className="flex justify-between text-slate-300">
                <span className="truncate">
                  {f.id}. {f.name}
                </span>
                <span className="tabular-nums">
                  {pct === null ? "—" : `${pct}% · ${Math.round(f.totalMs / Math.max(1, f.attempts) / 1000)} s`}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#6ea0ff]" style={{ width: `${pct ?? 0}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      {weak.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">Lo que más te cuesta</h3>
          <ul className="mt-1 text-xs text-slate-300">
            {weak.map((w) => (
              <li key={w.id} className="flex justify-between gap-2 py-0.5">
                <span className="truncate">{w.title}</span>
                <span className="tabular-nums">
                  {w.correct}/{w.attempts}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mb-2 mt-4 text-xs text-slate-500">
        Volver al nivel 1 no borra lo aprendido. Estas métricas no predicen tu puntuación del SAT; las rondas de 50 de Tocorito no son simulacros oficiales
        (el SAT real tiene 54 preguntas en 64 min).
      </p>
    </Sheet>
  );
}

function ReportSheet({ contest, onClose, onSend }: { contest: boolean; onClose: () => void; onSend: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet title={contest ? "Revisar la pregunta" : "Reportar pregunta"} onClose={onClose} dark>
      <p className="text-sm text-slate-400">
        {contest
          ? "Una revisión independiente la vuelve a resolver. Si era defectuosa, se deshace el reinicio."
          : "Se retira y te pongo otra en su lugar. No cuenta como error."}
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        rows={3}
        placeholder="¿Qué está mal? (opcional)"
        className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-[#161618] px-3 py-2 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-[#1450d8]"
      />
      <button onClick={() => onSend(reason)} className="mb-2 mt-3 min-h-12 w-full rounded-xl bg-[#1450d8] text-[15px] font-bold text-white">
        {contest ? "Revisar" : "Reportar"}
      </button>
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.06] px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "blue" | "gray" }) {
  return (
    <span className={`inline-block w-fit rounded-md px-2 py-0.5 text-xs font-bold ${tone === "blue" ? "bg-[#1450d8]/30 text-blue-100" : "bg-white/10 text-slate-300"}`}>{text}</span>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="m-auto flex w-full flex-col items-center py-6 text-center">{children}</div>;
}

function ErrorBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
      <span className="flex-1">{text}</span>
      <button onClick={onRetry} className="min-h-9 rounded-lg border border-red-300/40 px-3 font-semibold">
        Reintentar
      </button>
    </div>
  );
}
