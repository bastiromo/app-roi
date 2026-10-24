import { requireUser } from "@/lib/auth";
import { buildWorkbook } from "@/lib/export";

export async function GET() {
  const { supabase, user } = await requireUser();
  const buf = await buildWorkbook(supabase, user.email);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="app-roi-${day}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
