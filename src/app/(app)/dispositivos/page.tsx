import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, Tag } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { sha256Hex, TRUST_COOKIE } from "@/lib/trusted-device";
import { forgetAllDevices, forgetDevice } from "./actions";

export const metadata: Metadata = { title: "Dispositivos recordados" };

interface Device {
  id: string;
  token_hash: string;
  label: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
}

export default async function DevicesPage() {
  const { supabase } = await requireUser();
  const [{ data }, { data: nowIso }] = await Promise.all([
    supabase.from("trusted_devices").select("id,token_hash,label,created_at,expires_at,last_used_at").order("created_at", { ascending: false }).returns<Device[]>(),
    supabase.rpc("db_now"),
  ]);
  const now = Date.parse(String(nowIso ?? ""));
  const token = (await cookies()).get(TRUST_COOKIE)?.value;
  const mine = token ? await sha256Hex(token) : null;
  const active = (data ?? []).filter((d) => Date.parse(d.expires_at) > now);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dispositivos recordados"
        description="En estos dispositivos no se pide el código de verificación al ingresar, hasta la fecha indicada. Si pierdes uno, quítalo aquí."
      />
      {active.length === 0 ? (
        <p className="text-sm text-ink-2">
          No hay dispositivos recordados. Al ingresar el código de verificación, marca “Recordar este dispositivo por 30 días”.
        </p>
      ) : (
        <>
          <ul className="max-w-2xl divide-y divide-line rounded-xl border border-line bg-surface">
            {active.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="flex items-center gap-2 font-medium text-ink">
                    {d.label}
                    {d.token_hash === mine && <Tag tone="credit">Este dispositivo</Tag>}
                  </p>
                  <p className="text-xs text-ink-3">
                    Recordado hasta el {formatDate(d.expires_at.slice(0, 10))}
                    {d.last_used_at && `, último ingreso el ${formatDate(d.last_used_at.slice(0, 10))}`}
                  </p>
                </div>
                <form action={forgetDevice.bind(null, d.id)}>
                  <button className="text-sm text-ink-2 underline hover:text-debit">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={forgetAllDevices}>
            <button className="text-sm font-medium text-debit underline">Quitar todos (te pediremos el código en cada uno)</button>
          </form>
        </>
      )}
    </div>
  );
}
