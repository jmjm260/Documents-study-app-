"use client";

// Mapa de cursos (estilo Duolingo): Tocorito arriba tomando café, una línea punteada a cada curso,
// y debajo de cada curso su camino de círculos por fecha. Con 1–3 cursos se reparten el ancho;
// con más, las columnas se deslizan de lado y las líneas se recalculan.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import type { MapColumn, MapNode } from "@/lib/focus-map";

const LINE_H = 44;

export default function CourseMap({ columns, onNode }: { columns: MapColumn[]; onNode: (column: MapColumn, node: MapNode) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [lines, setLines] = useState<{ from: number; to: number; color: string }[]>([]);
  const [width, setWidth] = useState(0);

  // Tocorito toma café de vez en cuando (como en el chat).
  const [sipping, setSipping] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setSipping(true);
      setTimeout(() => setSipping(false), 1900);
    }, 9000);
    return () => clearInterval(id);
  }, []);

  // Dónde empieza cada línea (Tocorito, en el centro) y dónde acaba (centro de la cabecera de su curso).
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    setWidth(box.width);
    setLines(
      columns.map((c, i) => {
        const el = colRefs.current[i];
        const r = el?.getBoundingClientRect();
        return { from: box.width / 2, to: r ? r.left - box.left + r.width / 2 : box.width / 2, color: c.color };
      })
    );
  }, [columns]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={wrapRef} className="relative -mx-4 sm:-mx-6">
      <div className="flex justify-center">
        <TocoritoFigure height={92} sipping={sipping} priority />
      </div>
      <svg width={width} height={LINE_H} className="block" aria-hidden>
        {lines.map((l, i) => (
          <path
            key={i}
            d={`M${l.from} 0 C${l.from} ${LINE_H * 0.55}, ${l.to} ${LINE_H * 0.4}, ${l.to} ${LINE_H}`}
            fill="none"
            stroke={l.color}
            strokeWidth={2.5}
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div ref={scrollRef} onScroll={measure} className="snap-x scroll-px-2 overflow-x-auto px-2 pb-4 [scrollbar-width:none]">
        <div className="grid min-w-full grid-flow-col gap-1" style={{ gridAutoColumns: `minmax(${columns.length > 3 ? 112 : 96}px, 1fr)` }}>
          {columns.map((c, i) => (
            // self-start: cada columna mide lo suyo, así la línea del camino acaba en su último círculo.
            <div key={c.key} ref={(el) => void (colRefs.current[i] = el)} className="relative flex snap-start flex-col items-center self-start">
              {/* Línea vertical del camino */}
              <div className="absolute bottom-6 top-12 w-[3px] rounded-full bg-white/10" aria-hidden />
              <div className="relative z-10 w-full max-w-[120px] rounded-xl px-2 py-1.5 text-center" style={{ background: c.color }}>
                <p className="line-clamp-2 text-[13px] font-bold leading-tight">{c.name}</p>
                <p className="text-[11px] text-white/80">
                  {c.done} de {c.total} {c.total === 1 ? "lección" : "lecciones"}
                </p>
              </div>
              {c.nodes.map((n, j) => (
                <Node key={`${n.type}-${j}`} node={n} color={c.color} onClick={() => onNode(c, n)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const dayFmt = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

function when(date: string): string {
  const today = new Date();
  const d = new Date(`${date}T12:00:00`);
  const diff = Math.round((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()) / 86_400_000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  return dayFmt.format(d);
}

function Node({ node, color, onClick }: { node: MapNode; color: string; onClick: () => void }) {
  let style: React.CSSProperties = { background: "#27272a", color: "#71717a" };
  let icon: Icon = "lock";
  let bubble: string | null = null;
  let sub = when(node.date);

  if (node.type === "lesson") {
    style = { background: color, color: "#fff" };
    icon = "check";
  } else if (node.type === "pending") {
    style = { background: "#e5262b", color: "#fff", boxShadow: "0 0 0 4px #000, 0 0 0 7px #e5262b" };
    icon = "book";
    bubble = "Tu lección";
    sub = "resuelta";
  } else if (node.type === "exam") {
    icon = "trophy";
    if (node.reviewId && !node.reviewDone) {
      style = { background: "#b45309", color: "#fff", boxShadow: "0 0 0 4px #000, 0 0 0 7px #b45309" };
      bubble = "Repaso";
    } else if (node.reviewDone) {
      style = { background: color, color: "#fff" };
    }
  }

  const label = { lesson: "Lección hecha", pending: "Lección pendiente", task: "Tarea", exam: "Examen" }[node.type];
  return (
    <div className="relative z-10 mt-3 flex w-full flex-col items-center">
      {bubble && <span className="mb-1 rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold text-[#0b1840]">{bubble}</span>}
      <button
        onClick={onClick}
        aria-label={`${label}: ${node.title}, ${sub}`}
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full transition active:scale-95"
        style={{ boxShadow: "0 0 0 4px #000", ...style }}
      >
        <NodeIcon icon={icon} />
      </button>
      <p className="mt-1 line-clamp-2 max-w-[104px] bg-black px-1 text-center text-[11px] leading-tight text-slate-200">{node.title}</p>
      <p className="bg-black px-1 text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

type Icon = "check" | "lock" | "book" | "trophy";

function NodeIcon({ icon }: { icon: Icon }) {
  const paths: Record<Icon, React.ReactNode> = {
    check: <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />,
    lock: (
      <>
        <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
        <path strokeLinecap="round" d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
      </>
    ),
    book: <path strokeLinejoin="round" d="M4 5.5c3-1 5.5-.5 8 1.5 2.5-2 5-2.5 8-1.5v13c-3-1-5.5-.5-8 1.5-2.5-2-5-2.5-8-1.5v-13zM12 7v12.5" />,
    trophy: (
      <>
        <path strokeLinejoin="round" d="M7.5 4.5h9v5a4.5 4.5 0 0 1-9 0v-5z" />
        <path strokeLinecap="round" d="M7.5 6.5H5a2.5 2.5 0 0 0 2.6 3.5M16.5 6.5H19a2.5 2.5 0 0 1-2.6 3.5M12 14v3.5M8.5 19.5h7" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
      {paths[icon]}
    </svg>
  );
}
