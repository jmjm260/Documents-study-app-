// Markdown mínimo para las microlecciones: encabezados, listas, tablitas y **negrita**/`código` (vía RichText).
// Sin dependencias: suficiente para explicaciones cortas, no para documentos.
import RichText from "@/components/RichText";

export default function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("|")) {
      // Tabla: filas seguidas que empiezan por "|"; la fila de guiones se salta.
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const [head, ...body] = rows;
      blocks.push(
        <div key={i} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {head?.map((c, j) => (
                  <th key={j} className="border-b border-white/20 px-2 py-1 font-bold text-white">
                    <RichText text={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, k) => (
                <tr key={k}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-white/10 px-2 py-1 text-slate-200">
                      <RichText text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <p key={i} className="mt-3 font-bold text-white first:mt-0">
          {heading[1]}
        </p>
      );
      continue;
    }
    const bullet = /^([-•*]|\d+\.)\s+(.*)$/.exec(line);
    blocks.push(
      <p key={i} className={`mt-1.5 break-words ${bullet ? "pl-4 -indent-3" : ""}`}>
        {bullet && <span className="mr-1.5 text-[#6ea0ff]">{/\d/.test(bullet[1]) ? bullet[1] : "•"}</span>}
        <RichText text={bullet ? bullet[2] : line} />
      </p>
    );
  }
  return <div className="text-[15px] leading-relaxed text-slate-100">{blocks}</div>;
}
