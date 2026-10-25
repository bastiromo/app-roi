import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { deleteInvitation } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Invitaciones" };

interface Invitation {
  id: string;
  email: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  expired_flag: boolean;
}

export default async function InvitationsPage() {
  const { supabase } = await requireUser();
  const { data: admin } = await supabase.rpc("is_admin");
  if (!admin) notFound();

  const { data } = await supabase
    .from("invitations")
    .select("id,email,created_at,expires_at,used_at")
    .order("created_at", { ascending: false })
    .returns<Omit<Invitation, "expired_flag">[]>();
  // La fecha actual la decide la base (no el render), para que la página sea determinista
  const { data: nowIso } = await supabase.rpc("db_now");
  const now = String(nowIso ?? "");
  const rows: Invitation[] = (data ?? []).map((i) => ({ ...i, expired_flag: Date.parse(i.expires_at) < Date.parse(now) }));
  const h = await headers();
  const registerUrl = `https://${h.get("host") ?? "app-roi-gamma.vercel.app"}/registro`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Invitaciones"
        description="Invita a otra persona a usar la app. Tendrá su propia cuenta, con sus empresas, cuentas, gastos y payouts; no verá nada tuyo ni tú lo suyo."
      />
      <InviteForm registerUrl={registerUrl} />

      <section aria-labelledby="lista-invitaciones" className="space-y-3">
        <h2 id="lista-invitaciones" className="font-semibold">
          Enviadas
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-2">Aún no has invitado a nadie.</p>
        ) : (
          <ul className="divide-y divide-line rounded-3xl border border-line bg-surface shadow-card">
            {rows.map((i) => {
              const expired = !i.used_at && i.expired_flag;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">{i.email}</p>
                    <p className="text-xs text-ink-3">
                      Creada el {formatDate(i.created_at.slice(0, 10))}
                      {!i.used_at && !expired && `, vence el ${formatDate(i.expires_at.slice(0, 10))}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {i.used_at ? (
                      <Tag tone="credit">Cuenta creada</Tag>
                    ) : expired ? (
                      <Tag tone="debit">Vencida</Tag>
                    ) : (
                      <Tag tone="estimate">Pendiente</Tag>
                    )}
                    {!i.used_at && (
                      <form action={deleteInvitation.bind(null, i.id)}>
                        <button className="text-sm text-ink-2 underline hover:text-debit">{expired ? "Borrar" : "Cancelar"}</button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-ink-3">Las invitaciones duran 14 días y sirven una sola vez. Si vence, bórrala y crea otra.</p>
      </section>
    </div>
  );
}
