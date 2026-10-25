"use client";

// Barra de pestañas inferior, como en las apps de iOS/Android.
// Respeta la zona segura de abajo (la barra de inicio del iPhone) con safe-area-inset-bottom.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FOCUS_EVENT, isPendingReview, loadFocus, loadReviews } from "@/lib/focus-store";

const TABS = [
  { href: "/", label: "Tocorito", icon: ChatIcon },
  { href: "/focus", label: "Focus", icon: FocusIcon },
  { href: "/calendario", label: "Calendario", icon: CalendarIcon },
];

export default function TabBar() {
  const pathname = usePathname();
  // Punto rojo en Focus cuando hay una lección o una prueba de repaso pendiente.
  const [focusPending, setFocusPending] = useState(false);
  useEffect(() => {
    const sync = () => setFocusPending(Boolean(loadFocus()) || loadReviews().some(isPendingReview));
    sync();
    window.addEventListener(FOCUS_EVENT, sync);
    return () => window.removeEventListener(FOCUS_EVENT, sync);
  }, []);
  // Toda la app es oscura.
  const dark = true;
  return (
    <nav
      aria-label="Secciones"
      className={`shrink-0 border-t pb-[env(safe-area-inset-bottom)] ${dark ? "border-white/10 bg-black" : "border-t-[3px] border-[#0b1840] bg-white"}`}
    >
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${
                  active ? (dark ? "text-[#6ea0ff]" : "text-[#1450d8]") : dark ? "text-slate-500 active:text-white" : "text-slate-500 active:text-[#1450d8]"
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                  {href === "/focus" && focusPending && (
                    <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-black bg-[#e5262b]" aria-label="Lección pendiente" />
                  )}
                </span>
                {label}
                <span className={`h-1 w-6 rounded-full ${active ? "bg-[#e5262b]" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinejoin="round" d="M4 5h16v11H9l-5 4V5z" />
    </svg>
  );
}

function FocusIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill={active ? "currentColor" : "none"} />
      {active && <circle cx="12" cy="12" r="4.5" fill="currentColor" opacity={0.35} />}
    </svg>
  );
}

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill={active ? "currentColor" : "none"} />
      <path strokeLinecap="round" d="M8 3v4M16 3v4" />
      <path d="M3.5 10h17" stroke={active ? "white" : "currentColor"} />
    </svg>
  );
}
