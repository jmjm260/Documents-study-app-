// Muestra el texto de Tocorito con fórmulas bonitas (KaTeX), **negrita** y *cursiva*.
// Solo insertamos como HTML lo que genera KaTeX (que escapa la entrada); el resto lo escapa React.
import katex from "katex";

type Token = { kind: "text" | "inline" | "display"; value: string };

/** Separa el texto en trozos normales y fórmulas: $$…$$, \[…\], $…$, \(…\). */
export function tokenizeMath(text: string): Token[] {
  const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) tokens.push({ kind: "text", value: text.slice(last, m.index) });
    const display = m[1] ?? m[2];
    tokens.push(display !== undefined ? { kind: "display", value: display.trim() } : { kind: "inline", value: (m[3] ?? m[4]).trim() });
    last = m.index! + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });
  return tokens;
}

function Math({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore" });
  return display ? (
    <span className="my-2 block overflow-x-auto rounded-lg bg-slate-50 px-2 py-1.5" dangerouslySetInnerHTML={{ __html: html }} />
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
        t.kind === "text" ? <Emphasis key={i} text={t.value} /> : <Math key={i} tex={t.value} display={t.kind === "display"} />
      )}
    </>
  );
}
