"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Las secciones sin href se habilitan en sus etapas de desarrollo.
const ITEMS: { label: string; href?: string; stage?: string }[] = [
  { label: "Resumen", href: "/" },
  { label: "Empresas", href: "/empresas" },
  { label: "Cuentas", href: "/cuentas" },
  { label: "Gastos", href: "/gastos" },
  { label: "Payouts", href: "/payouts" },
  { label: "Ventas de cripto", href: "/conversiones" },
  { label: "Importar", href: "/importar" },
  { label: "Exportar", href: "/exportar" },
];

export function Nav({ orientation, large = false, admin = false }: { orientation: "vertical" | "horizontal"; large?: boolean; admin?: boolean }) {
  const path = usePathname();
  const items = admin ? [...ITEMS, { label: "Invitaciones", href: "/invitaciones" }] : ITEMS;
  const vertical = orientation === "vertical";
  return (
    <nav aria-label="Principal" className={vertical ? "flex flex-col gap-0.5" : "grid grid-cols-6"}>
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : !!item.href && path.startsWith(item.href);
        const base = vertical
          ? `flex items-center justify-between rounded-lg px-2 ${large ? "py-3 text-base" : "py-2 text-sm"}`
          : "flex flex-col items-center py-3 text-[11px]";
        if (!item.href) {
          return (
            <span key={item.label} aria-disabled="true" title={`Disponible en ${item.stage}`} className={`${base} text-ink-3`}>
              {item.label}
              {vertical && <span className="text-[11px] text-ink-3">{item.stage}</span>}
            </span>
          );
        }
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${base} ${active ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"} ${active && vertical ? "bg-surface-2" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
