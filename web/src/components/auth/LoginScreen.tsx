"use client";

// Inicio de sesión sin contraseña: el estudiante pone su correo y recibe un enlace.
// Si la cuenta es nueva, pedimos mes y año de nacimiento (solo 13+). No pedimos nada más.
import { useEffect, useState } from "react";
import TocoritoFigure from "@/components/chat/TocoritoFigure";
import { isOldEnough, MIN_AGE } from "@/lib/age";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const field =
  "min-h-12 w-full rounded-xl border border-white/15 bg-[#161618] px-4 text-[15px] text-white outline-none placeholder:text-slate-500 focus:border-[#3b74ff] focus:ring-2 focus:ring-[#3b74ff]/30 [color-scheme:dark]";

export default function LoginScreen() {
  const [step, setStep] = useState<"email" | "birth" | "sent">("email");
  const [email, setEmail] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Si el enlace del correo falló o caducó, el middleware vuelve con ?login=error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("login") === "error") {
      setError("Ese enlace no sirvió o ya caducó. Pide otro.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function send(withBirth: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withBirth ? { email, birthYear: Number(year), birthMonth: Number(month) } : { email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No pude enviar el correo.");
      if (data.needsBirth) setStep("birth");
      else {
        setStep("sent");
        setCooldown(60);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pude enviar el correo.");
    } finally {
      setBusy(false);
    }
  }

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, i) => thisYear - MIN_AGE + 1 - i);
  const tooYoung = Boolean(month && year) && !isOldEnough(Number(year), Number(month));

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center overflow-y-auto bg-black px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] font-sans text-white">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <TocoritoFigure height={140} priority />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
          {step === "sent" ? "Revisa tu correo" : step === "birth" ? "Crea tu cuenta" : "Entra con tu correo"}
        </h1>

        {step === "email" && (
          <form
            className="mt-6 flex w-full flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(false);
            }}
          >
            <p className="text-sm text-slate-400">Sin contraseñas: te mandamos un enlace para entrar.</p>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              aria-label="Correo electrónico"
              className={field}
            />
            <button disabled={busy || !email} className="min-h-12 rounded-xl bg-[#1450d8] text-[15px] font-bold disabled:opacity-50">
              {busy ? "Enviando…" : "Continuar"}
            </button>
          </form>
        )}

        {step === "birth" && (
          <form
            className="mt-6 flex w-full flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(true);
            }}
          >
            <p className="text-sm text-slate-400">
              Es tu primera vez con <span className="text-white">{email}</span>. ¿Cuándo naciste? Solo guardamos el mes y el año.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <select required value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes de nacimiento" className={field}>
                <option value="">Mes</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <select required value={year} onChange={(e) => setYear(e.target.value)} aria-label="Año de nacimiento" className={field}>
                <option value="">Año</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            {tooYoung && <p className="text-sm text-amber-300">Para usar la app hay que tener {MIN_AGE} años o más.</p>}
            <button disabled={busy || !month || !year || tooYoung} className="min-h-12 rounded-xl bg-[#1450d8] text-[15px] font-bold disabled:opacity-50">
              {busy ? "Enviando…" : "Crear cuenta"}
            </button>
            <button type="button" onClick={() => setStep("email")} className="min-h-11 text-sm text-slate-400">
              Usar otro correo
            </button>
          </form>
        )}

        {step === "sent" && (
          <div className="mt-4 flex w-full flex-col gap-3">
            <p className="text-sm text-slate-300">
              Te mandamos un enlace a <span className="font-semibold text-white">{email}</span>. Ábrelo en <b>este mismo navegador</b> para entrar.
            </p>
            <p className="text-xs text-slate-500">¿No llega? Mira en spam o promociones.</p>
            <button
              disabled={busy || cooldown > 0}
              onClick={() => send(false)}
              className="min-h-11 rounded-xl border border-white/15 text-sm font-semibold text-slate-200 disabled:opacity-50"
            >
              {cooldown > 0 ? `Reenviar en ${cooldown} s` : "Reenviar enlace"}
            </button>
            <button onClick={() => setStep("email")} className="min-h-11 text-sm text-slate-400">
              Usar otro correo
            </button>
          </div>
        )}

        {error && <p className="mt-4 w-full rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}

        <p className="mt-8 text-[11px] leading-relaxed text-slate-600">
          Solo para mayores de {MIN_AGE} años. Guardamos tu correo y tus chats para que no se pierdan; puedes borrarlos cuando quieras.
        </p>
      </div>
    </div>
  );
}
