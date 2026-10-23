"use client";

// Barra de pestañas inferior, como en las apps de iOS/Android.
// Respeta la zona segura de abajo (la barra de inicio del iPhone) con safe-area-inset-bottom.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Tocorito", icon: ChatIcon },
  { href: "/calendario", label: "Calendario", icon: CalendarIcon },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Secciones"
      className="shrink-0 border-t-[3px] border-[#0b1840] bg-white pb-[env(safe-area-inset-bottom)]"
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
                  active ? "text-[#1450d8]" : "text-slate-500 active:text-[#1450d8]"
                }`}
              >
                <Icon active={active} />
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

function CalendarIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" fill={active ? "currentColor" : "none"} />
      <path strokeLinecap="round" d="M8 3v4M16 3v4" />
      <path d="M3.5 10h17" stroke={active ? "white" : "currentColor"} />
    </svg>
  );
}
