"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat";

const GREETING: ChatMessage = {
  role: "assistant",
  content: "¡Hola! Soy Tocorito ☕ Déjame darle un sorbo al café… Listo. ¿Qué estamos estudiando hoy?",
};

const SUGGESTIONS = ["Explícame las fracciones", "Ayúdame a organizar mi semana", "¿Cómo hago un buen resumen?"];

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || thinking) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setError(null);
    setThinking(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // El saludo es local; no hace falta mandarlo.
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Tocorito no pudo responder.");
      setMessages([...next, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tocorito no pudo responder.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-[#0d3bb5] via-[#1450d8] to-[#2f6fef] font-sans text-[#0b1840]">
      {/* Franja con los colores del tocororo: azul, blanco y rojo */}
      <div className="flex h-1.5">
        <div className="flex-1 bg-[#0b1840]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#e5262b]" />
      </div>

      <header className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pt-5 pb-3">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-[3px] border-[#0b1840] bg-white shadow-lg">
          <Image src="/tocoro.webp" alt="Tocorito" fill sizes="56px" className="object-contain p-0.5" priority />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow">Tocorito</h1>
          <p className="text-sm text-blue-100">Tu tutor de estudio · {thinking ? "pensando… ☕" : "en línea"}</p>
        </div>
        <Link
          href="/calendario"
          className="rounded-full border-2 border-white/70 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
        >
          Calendario
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-4">
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-3xl border-[3px] border-[#0b1840] bg-[#fdf8ef] p-4 shadow-2xl">
          {messages.map((m, i) => (
            <Bubble key={i} message={m} />
          ))}
          {thinking && (
            <div className="flex items-end gap-2">
              <Avatar />
              <div className="rounded-2xl rounded-bl-sm bg-[#1450d8] px-4 py-3 text-white">
                <span className="inline-flex gap-1">
                  <Dot delay="0ms" />
                  <Dot delay="150ms" />
                  <Dot delay="300ms" />
                </span>
              </div>
            </div>
          )}
          {messages.length === 1 && !thinking && (
            <div className="mt-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border-2 border-[#1450d8] bg-white px-3 py-1.5 text-sm font-medium text-[#1450d8] hover:bg-[#1450d8] hover:text-white"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="rounded-xl border-2 border-[#e5262b] bg-red-50 px-3 py-2 text-sm text-[#b81d21]">{error}</p>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            placeholder="Pregúntale algo a Tocorito…"
            className="flex-1 rounded-full border-[3px] border-[#0b1840] bg-white px-4 py-3 text-[15px] outline-none placeholder:text-slate-400 focus:border-[#f59e0b]"
          />
          <button
            disabled={thinking || !input.trim()}
            className="rounded-full border-[3px] border-[#0b1840] bg-[#e5262b] px-5 font-bold text-white shadow-md transition hover:bg-[#c81f24] disabled:opacity-50"
          >
            Enviar
          </button>
        </form>
        <p className="mt-2 text-center text-xs text-blue-100">
          Tocorito puede equivocarse. No compartas contraseñas ni datos personales.
        </p>
      </main>
    </div>
  );
}

function Avatar() {
  return (
    <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border-2 border-[#0b1840] bg-white">
      <Image src="/tocoro.webp" alt="" fill sizes="32px" className="object-contain" />
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#e5262b] px-4 py-2.5 text-[15px] text-white shadow">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <Avatar />
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-[#1450d8] px-4 py-2.5 text-[15px] text-white shadow">
        <Formatted text={message.content} />
      </div>
    </div>
  );
}

/** Muestra **negrita** y *cursiva* (Tocorito usa *suspiro*). Sin HTML crudo: React escapa el texto. */
function Formatted({ text }: { text: string }) {
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

function Dot({ delay }: { delay: string }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-[#f59e0b]" style={{ animationDelay: delay }} />;
}
