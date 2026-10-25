import Link from "next/link";
import { redirect } from "next/navigation";
import { MobileMenu } from "@/components/mobile-menu";
import { PillNav } from "@/components/nav";
import { HomeLogo, PullToRefresh } from "@/components/refresh";
import { SideRail } from "@/components/side-rail";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, supabase } = await requireUser();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="min-h-dvh">
      {/* Computador: marca, navegación en píldora y cuenta */}
      <header className="sticky top-0 z-30 hidden bg-bg/85 backdrop-blur-md lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 py-4 pl-28 pr-8">
          <HomeLogo size={34} className="gap-2.5 text-[15px]" />
          <PillNav />
          <Link
            href="/dispositivos"
            title={user.email}
            aria-label={`Tu cuenta: ${user.email}`}
            className="grid size-11 place-items-center rounded-full border border-line bg-surface text-xs font-semibold text-ink-2 shadow-card hover:text-ink"
          >
            {initials}
          </Link>
        </div>
      </header>

      <PullToRefresh />
      <SideRail admin={Boolean(isAdmin)} signOut={signOut} />
      <MobileMenu email={user.email} signOut={signOut} admin={Boolean(isAdmin)} />

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 md:px-8 lg:pl-28 lg:pt-6">{children}</main>
    </div>
  );
}
