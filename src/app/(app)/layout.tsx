import { redirect } from "next/navigation";
import { LedgerMark } from "@/components/ledger-mark";
import { MobileMenu } from "@/components/mobile-menu";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-surface md:flex md:flex-col md:px-4 md:py-6">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <LedgerMark size={26} />
          <span className="font-semibold tracking-tight">App ROI</span>
        </div>
        <Nav orientation="vertical" />
        <form action={signOut} className="mt-auto px-2">
          <p className="truncate text-xs text-ink-3" title={user.email}>{user.email}</p>
          <button className="mt-1 text-sm text-ink-2 hover:text-ink">Cerrar sesión</button>
        </form>
      </aside>

      <MobileMenu email={user.email} signOut={signOut} />

      <main className="mx-auto w-full max-w-5xl px-4 pb-12 pt-6 md:px-10 md:pb-12 md:pt-10">{children}</main>

    </div>
  );
}
