import { requireUser } from "@/lib/auth";
import { expensesCsv } from "@/lib/export";

export async function GET() {
  const { supabase } = await requireUser();
  const { text } = await expensesCsv(supabase);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(text, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="app-roi-gastos-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
