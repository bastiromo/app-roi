"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Secciones principales (barra superior en computador). */
export const PRIMARY: { label: string; href: string }[] = [
  { label: "Resumen", href: "/" },
  { label: "Empresas", href: "/empresas" },
  { label: "Cuentas", href: "/cuentas" },
  { label: "Gastos", href: "/gastos" },
  { label: "Payouts", href: "/payouts" },
  { label: "Ventas de cripto", href: "/conversiones" },
];

/** Herramientas (barra lateral flotante en computador; al final del menú en el celular). */
export const SECONDARY: { label: string; href: string; adminOnly?: boolean }[] = [
  { label: "Importar", href: "/importar" },
  { label: "Exportar", href: "/exportar" },
  { label: "Invitaciones", href: "/invitaciones", adminOnly: true },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Píldora de navegación superior (computador). */
export function PillNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="flex items-center gap-0.5 rounded-full border border-line bg-surface p-1 shadow-card">
      {PRIMARY.map((item) => {
        const active = isActive(path, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              active ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Lista vertical (menú del celular): principales y luego herramientas. */
export function Nav({ admin = false }: { admin?: boolean }) {
  const path = usePathname();
  const tools = SECONDARY.filter((i) => !i.adminOnly || admin);
  const link = (item: { label: string; href: string }) => {
    const active = isActive(path, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`rounded-full px-4 py-3 text-base transition-colors ${active ? "bg-ink font-semibold text-bg" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
      >
        {item.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Principal" className="flex flex-col gap-1">
      {PRIMARY.map(link)}
      <p className="mt-4 px-4 pb-1 text-xs font-medium uppercase tracking-wider text-ink-3">Herramientas</p>
      {tools.map(link)}
    </nav>
  );
}
