"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Nav } from "./nav";
import { HomeLogo, reloadApp } from "./refresh";
import { ThemeSwitch } from "./theme-switch";

/** Barra superior del celular con botón de menú (hamburguesa) que abre un panel lateral. */
export function MobileMenu({ email, signOut, admin = false }: { email: string; signOut: () => Promise<void>; admin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState<string | null>(null);
  const path = usePathname();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const openBtn = useRef<HTMLButtonElement>(null);

  // Al navegar a otra sección, el menú se cierra solo
  if (path !== lastPath) {
    setLastPath(path);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const trigger = openBtn.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden">
        <HomeLogo size={24} />
        <button
          ref={openBtn}
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={open}
          aria-controls="menu-movil"
          className="grid size-11 place-items-center rounded-full border border-line bg-surface text-ink shadow-card"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 8h14M5 16h14" />
          </svg>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú" id="menu-movil">
          <button aria-label="Cerrar menú" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="menu-panel absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto rounded-l-3xl bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="px-2 font-semibold tracking-tight">Menú</span>
              <button
                ref={closeBtn}
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="grid size-11 place-items-center rounded-full text-ink hover:bg-surface-2"
              >
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <Nav admin={admin} />
            <div className="mt-auto border-t border-line pt-3">
              <button
                type="button"
                onClick={reloadApp}
                className="mb-1 flex w-full items-center gap-2 rounded-full px-4 py-3 text-base text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
                </svg>
                Actualizar
              </button>
              <ThemeSwitch />
            </div>
            <form action={signOut} className="mt-2 border-t border-line px-2 pt-4">
              <p className="truncate text-xs text-ink-3">{email}</p>
              <Link href="/dispositivos" className="mt-1 block text-sm text-ink-2 hover:text-ink">
                Dispositivos recordados
              </Link>
              <button className="mt-1 text-sm text-ink-2 hover:text-ink">Cerrar sesión</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
