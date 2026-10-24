import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

/** Cliente de Supabase para componentes de servidor y acciones (actúa como el usuario logueado). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Llamado desde un Server Component: el proxy ya refresca la sesión.
        }
      },
    },
  });
}
