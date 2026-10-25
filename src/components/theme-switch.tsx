"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Tema de la app: Claro, Oscuro o Rosa. La elección se guarda en este dispositivo; sin elección
 * se sigue la configuración del sistema (claro u oscuro). THEME_SCRIPT (en el layout raíz) la
 * aplica antes de dibujar la página, para que no haya parpadeo.
 */
const KEY = "app-roi-theme";
export const THEMES = ["light", "dark", "pink"] as const;
export type Theme = (typeof THEMES)[number];
const LABEL: Record<Theme, string> = { light: "Claro", dark: "Oscuro", pink: "Rosa" };
// Muestra de color de cada tema (fondo y acento)
const SWATCH: Record<Theme, [string, string]> = { light: ["#ebeae6", "#161616"], dark: ["#171717", "#f2f2f0"], pink: ["#f6e8ec", "#c2185b"] };

const listeners = new Set<() => void>();

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function current(): Theme {
  const t = document.documentElement.dataset.theme;
  return (THEMES as readonly string[]).includes(t ?? "") ? (t as Theme) : systemDark() ? "dark" : "light";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // almacenamiento no disponible (modo privado): se aplica solo en esta sesión
  }
  listeners.forEach((l) => l());
}

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light"||t==="pink")document.documentElement.dataset.theme=t;}catch(e){}})();`;

function useTheme() {
  return useSyncExternalStore(subscribe, current, () => "light" as Theme);
}

function Swatch({ t }: { t: Theme }) {
  const [bg, accent] = SWATCH[t];
  return (
    <span aria-hidden="true" className="relative inline-block size-4 shrink-0 overflow-hidden rounded-full border border-black/15" style={{ background: bg }}>
      <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: accent }} />
    </span>
  );
}

/** Selector de tema del menú del celular: tres opciones en píldora. */
export function ThemeSwitch() {
  const theme = useTheme();
  return (
    <div className="px-2 py-2">
      <p className="mb-2 text-sm text-ink-2">Tema</p>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
        {THEMES.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={theme === t}
            onClick={() => setTheme(t)}
            className={`flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition-colors ${
              theme === t ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"
            }`}
          >
            <Swatch t={t} />
            {LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Botón de la barra lateral: abre un pequeño panel con los tres temas. */
export function ThemeIconButton({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={`Tema: ${LABEL[theme]}`} aria-expanded={open} className={className}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {theme === "dark" ? (
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          ) : theme === "pink" ? (
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </>
          )}
        </svg>
        {!open && <span className="rail-tip">Tema: {LABEL[theme]}</span>}
      </button>
      {open && (
        <div role="radiogroup" aria-label="Tema" className="absolute left-[calc(100%+0.75rem)] top-1/2 flex -translate-y-1/2 gap-1 rounded-full border border-line bg-surface p-1 shadow-card">
          {THEMES.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => {
                setTheme(t);
                setOpen(false);
              }}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                theme === t ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Swatch t={t} />
              {LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
