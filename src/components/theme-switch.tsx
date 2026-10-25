"use client";

import { useSyncExternalStore } from "react";

/**
 * Switch de modo oscuro. La elección se guarda en este dispositivo; sin elección se sigue
 * la configuración del sistema. El script THEME_SCRIPT (en el layout raíz) la aplica antes
 * de dibujar la página, para que no haya un parpadeo claro→oscuro.
 */
const KEY = "app-roi-theme";
const listeners = new Set<() => void>();

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : systemDark();
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

function setDark(dark: boolean) {
  const theme = dark ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // almacenamiento no disponible (modo privado): se aplica solo en esta sesión
  }
  listeners.forEach((l) => l());
}

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export function ThemeSwitch() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm text-ink-2 hover:text-ink">
      <span className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
        Modo oscuro
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={dark}
        aria-checked={dark}
        onChange={(e) => setDark(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full bg-line transition-colors after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow after:transition-transform peer-checked:bg-ink peer-checked:after:translate-x-5 peer-checked:after:bg-bg peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-focus"
      />
    </label>
  );
}

/** Versión ícono (barra lateral): luna en modo claro, sol en modo oscuro. */
export function ThemeIconButton({ className = "" }: { className?: string }) {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const label = dark ? "Usar modo claro" : "Usar modo oscuro";
  return (
    <button type="button" onClick={() => setDark(!dark)} aria-label={label} className={className}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
      <span className="rail-tip">{label}</span>
    </button>
  );
}
