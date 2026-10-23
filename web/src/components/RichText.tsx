// Muestra el texto de Tocorito con fórmulas bonitas (KaTeX), `código`, **negrita** y *cursiva*.
// Solo insertamos como HTML lo que genera KaTeX (que escapa la entrada); el resto lo escapa React.
import katex from "katex";

type Token = { kind: "text" | "inline" | "display" | "code" | "codeblock"; value: string };

/**
 * Separa el texto en trozos normales, código (```…```, `…`) y fórmulas ($$…$$, \[…\], $…$, \(…\)).
 * El código va primero: así un "$t0" de ensamblador dentro de `…` no se toma por fórmula.
 */
export function tokenizeMath(text: string): Token[] {
  const re =
    /```[^\n`]*\n?([\s\S]+?)```|`([^`\n]+)`|\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?!\s)([^$\n`]+?)(?<!\s)\$(?!\d)/g;
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) tokens.push({ kind: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ kind: "codeblock", value: m[1].replace(/\n$/, "") });
    else if (m[2] !== undefined) tokens.push({ kind: "code", value: m[2] });
    else if ((m[3] ?? m[4]) !== undefined) tokens.push({ kind: "display", value: (m[3] ?? m[4]).trim() });
    else tokens.push({ kind: "inline", value: (m[5] ?? m[6]).trim() });
    last = m.index! + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });
  return tokens;
}

function Math({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore" });
  return display ? (
    <span className="my-2 block overflow-x-auto rounded-lg bg-white/10 px-2 py-1.5" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <em key={i} className="opacity-90">{part.slice(1, -1)}</em>
        ) : (
          part
        )
      )}
    </>
  );
}

export default function RichText({ text }: { text: string }) {
  return (
    <>
      {tokenizeMath(text).map((t, i) =>
        t.kind === "text" ? (
          <Emphasis key={i} text={t.value} />
        ) : t.kind === "code" ? (
          <code key={i} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.9em]">
            {t.value}
          </code>
        ) : t.kind === "codeblock" ? (
          <code key={i} className="my-2 block overflow-x-auto whitespace-pre rounded-lg bg-white/10 px-3 py-2 font-mono text-[13px] leading-snug">
            {t.value}
          </code>
        ) : (
          <Math key={i} tex={t.value} display={t.kind === "display"} />
        )
      )}
    </>
  );
}
