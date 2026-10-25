"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LedgerMark } from "./ledger-mark";

/** Recarga completa: datos al día y, si hay, la última versión publicada de la app. */
export function reloadApp() {
  window.location.reload();
}

/** Logo "App ROI": lleva al Resumen; si ya estás ahí, actualiza la página. */
export function HomeLogo({ size = 24, className = "" }: { size?: number; className?: string }) {
  const path = usePathname();
  return (
    <Link
      href="/"
      onClick={(e) => {
        if (path === "/") {
          e.preventDefault();
          reloadApp();
        }
      }}
      aria-label={path === "/" ? "App ROI: actualizar" : "App ROI: ir al Resumen"}
      className={`flex items-center gap-2 ${className}`}
    >
      <LedgerMark size={size} />
      <span className="font-semibold tracking-tight">App ROI</span>
    </Link>
  );
}

const THRESHOLD = 70; // px que hay que arrastrar (ya amortiguado) para actualizar

/**
 * "Arrastrar hacia abajo para actualizar" cuando la app está instalada en la pantalla de inicio
 * (ahí el iPhone no lo trae). En el navegador no se activa: Safari y Chrome ya tienen el suyo.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    // Sin el rebote del iPhone (dejaba un espacio gris vacío): el arrastre lo dibujamos nosotros
    document.documentElement.classList.add("standalone");

    let startY: number | null = null;
    let dist = 0;
    const start = (e: TouchEvent) => {
      // Solo desde arriba de todo, con un dedo y sin el menú abierto
      startY = window.scrollY <= 0 && e.touches.length === 1 && document.body.style.overflow !== "hidden" ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      if (window.scrollY > 0) {
        startY = null;
        setPull(0);
        return;
      }
      dist = Math.max(0, e.touches[0].clientY - startY) * 0.5;
      setPull(Math.min(dist, 110));
    };
    const end = () => {
      if (startY !== null && dist >= THRESHOLD) {
        setBusy(true);
        setPull(THRESHOLD);
        reloadApp();
      } else {
        setPull(0);
      }
      startY = null;
      dist = 0;
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  if (pull === 0 && !busy) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-[env(safe-area-inset-top)]"
      style={{ transform: `translateY(${pull - 8}px)`, transition: pull === 0 || busy ? "transform 200ms ease" : undefined }}
    >
      <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-2 shadow-card">
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={busy ? "animate-spin" : ""}
          style={busy ? undefined : { transform: `rotate(${Math.min(pull / THRESHOLD, 1) * 270}deg)` }}
        >
          <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />
        </svg>
        {busy ? "Actualizando…" : ready ? "Suelta para actualizar" : "Desliza para actualizar"}
      </span>
    </div>
  );
}
