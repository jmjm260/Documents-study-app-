// Gráfico o tabla de una pregunta de evidencia cuantitativa, dibujado A PARTIR DE LOS DATOS (SVG/tabla):
// lo que se ve coincide siempre con los números. Cada valor va rotulado y la tabla de datos está a mano.
import type { SatChart as Chart } from "@/lib/sat/items";

const COLORS = ["#6ea0ff", "#f59e0b", "#34d399", "#f472b6"];
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

export default function SatChart({ chart }: { chart: Chart }) {
  return (
    <figure className="my-3 rounded-xl border border-white/15 bg-white/[0.03] p-3">
      <figcaption className="mb-2 text-sm font-bold text-white">{chart.title}</figcaption>
      {chart.kind === "table" ? <DataTable chart={chart} /> : <Plot chart={chart} />}
      {chart.kind !== "table" && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-400">Ver los datos en tabla</summary>
          <DataTable chart={chart} />
        </details>
      )}
      {chart.note && <p className="mt-2 text-xs text-slate-400">{chart.note}</p>}
    </figure>
  );
}

function DataTable({ chart }: { chart: Chart }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            <th className="border-b border-white/20 px-2 py-1 text-slate-300">{chart.xLabel ?? ""}</th>
            {chart.series.map((s) => (
              <th key={s.name} className="border-b border-white/20 px-2 py-1 text-white">
                {s.name}
                {chart.unit ? ` (${chart.unit})` : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chart.categories.map((c, i) => (
            <tr key={c}>
              <td className="border-b border-white/10 px-2 py-1 text-slate-300">{c}</td>
              {chart.series.map((s) => (
                <td key={s.name} className="border-b border-white/10 px-2 py-1 tabular-nums text-white">
                  {fmt(s.values[i])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Plot({ chart }: { chart: Chart }) {
  const W = 320;
  const H = 180;
  const pad = { l: 34, r: 8, t: 14, b: 34 };
  const all = chart.series.flatMap((s) => s.values);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / span);
  const n = chart.categories.length;
  const step = (W - pad.l - pad.r) / n;
  const label = `${chart.title}. ${chart.series.map((s) => `${s.name}: ${chart.categories.map((c, i) => `${c} ${fmt(s.values[i])}`).join(", ")}`).join(". ")}`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#475569" />
        <text x={4} y={pad.t} className="fill-slate-400" fontSize="9">
          {fmt(max)}
        </text>
        <text x={4} y={y(0) + 3} className="fill-slate-400" fontSize="9">
          0
        </text>
        {chart.categories.map((c, i) => (
          <text key={c} x={pad.l + step * (i + 0.5)} y={H - pad.b + 12} textAnchor="middle" className="fill-slate-300" fontSize="9">
            {c.length > 10 ? `${c.slice(0, 9)}…` : c}
          </text>
        ))}
        {chart.kind === "bar"
          ? chart.series.map((s, si) => {
              const bw = (step * 0.75) / chart.series.length;
              return s.values.map((v, i) => {
                const x = pad.l + step * i + step * 0.125 + bw * si;
                return (
                  <g key={`${si}-${i}`}>
                    <rect x={x} y={Math.min(y(v), y(0))} width={bw - 1} height={Math.abs(y(v) - y(0))} fill={COLORS[si]} rx={1.5} />
                    <text x={x + bw / 2} y={y(v) - 2} textAnchor="middle" className="fill-white" fontSize="8">
                      {fmt(v)}
                    </text>
                  </g>
                );
              });
            })
          : chart.series.map((s, si) => (
              <g key={si}>
                <polyline
                  fill="none"
                  stroke={COLORS[si]}
                  strokeWidth={2}
                  points={s.values.map((v, i) => `${pad.l + step * (i + 0.5)},${y(v)}`).join(" ")}
                />
                {s.values.map((v, i) => (
                  <g key={i}>
                    <circle cx={pad.l + step * (i + 0.5)} cy={y(v)} r={2.5} fill={COLORS[si]} />
                    <text x={pad.l + step * (i + 0.5)} y={y(v) - 5} textAnchor="middle" className="fill-white" fontSize="8">
                      {fmt(v)}
                    </text>
                  </g>
                ))}
              </g>
            ))}
        {chart.xLabel && (
          <text x={(W + pad.l) / 2} y={H - 4} textAnchor="middle" className="fill-slate-400" fontSize="9">
            {chart.xLabel}
          </text>
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-300">
        {chart.series.map((s, si) => (
          <span key={s.name} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[si] }} />
            {s.name}
            {chart.unit ? ` (${chart.unit})` : ""}
          </span>
        ))}
        {chart.yLabel && <span className="text-slate-500">Eje vertical: {chart.yLabel}</span>}
      </div>
    </div>
  );
}
