"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SECONDARY } from "./nav";
import { ThemeIconButton } from "./theme-switch";

const ICONS: Record<string, ReactNode> = {
  "/importar": <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />,
  "/exportar": <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />,
  "/invitaciones": (
    <>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 19a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" />
    </>
  ),
  "/dispositivos": (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 17.5h2" />
    </>
  ),
};

const btn =
  "rail-btn group relative grid size-11 place-items-center rounded-full text-hero-ink-2 transition-colors hover:bg-hero-ink/10 hover:text-hero-ink";

/** Barra lateral flotante (computador): herramientas, modo oscuro y cerrar sesión. */
export function SideRail({ admin, signOut }: { admin: boolean; signOut: () => Promise<void> }) {
  const path = usePathname();
  const items = [...SECONDARY.filter((i) => !i.adminOnly || admin), { label: "Dispositivos recordados", href: "/dispositivos" }];
  return (
    <aside
      aria-label="Herramientas"
      className="fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-hero p-2 shadow-card lg:flex"
    >
      {items.map((i) => {
        const active = path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-label={i.label}
            aria-current={active ? "page" : undefined}
            className={`${btn} ${active ? "bg-hero-ink/15 text-hero-ink" : ""}`}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[i.href]}
            </svg>
            <span className="rail-tip">{i.label}</span>
          </Link>
        );
      })}
      <span aria-hidden="true" className="my-1 h-px w-6 bg-hero-ink/15" />
      <ThemeIconButton className={btn} />
      <form action={signOut}>
        <button aria-label="Cerrar sesión" className={btn}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h9" />
          </svg>
          <span className="rail-tip">Cerrar sesión</span>
        </button>
      </form>
    </aside>
  );
}
