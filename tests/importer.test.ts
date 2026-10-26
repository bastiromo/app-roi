import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { labelFromExternalId, normalizeDate, parseCsv, parseImport } from "../src/domain/importer";

const fixture = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");

describe("CSV", () => {
  it("comillas, separadores y saltos", () => {
    expect(parseCsv('a,b\n"x, y",2\r\n"dice ""hola""";3\n')).toEqual([["a", "b"], ["x, y", "2"], ['dice "hola"', "3"]]);
  });
  it.each([
    ["2026-10-15", "2026-10-15"], ["15-10-2026", "2026-10-15"], ["5/7/2026", "2026-07-05"], ["Oct 15, 2026", "2026-10-15"], ["Sept 2, 2026", "2026-09-02"], ["ayer", null],
  ])("fecha %s → %s", (a, b) => expect(normalizeDate(a)).toBe(b));
  it("etiqueta desde ID de Lucid", () => expect(labelFromExternalId("LFF050-0BY89NW5-PRO008")).toBe("PRO008"));
});

describe("historial real de Lucid", () => {
  it("órdenes: 57 filas, 7 fallidas, sin errores", () => {
    const p = parseImport(fixture("lucid_orders_2026-10-24.csv"));
    expect(p.kind).toBe("expenses");
    expect(p.errors).toEqual([]);
    expect(p.rows).toHaveLength(57);
    if (p.kind !== "expenses") throw new Error();
    expect(p.rows.filter((r) => r.status === "failed")).toHaveLength(7);
    const paid = p.rows.filter((r) => r.status === "paid").reduce((t, r) => t + Math.round(Number(r.amount) * 100), 0);
    expect(paid / 100).toBe(5032.4);
  });
  it("payouts: 12 filas, 7 cuentas", () => {
    const p = parseImport(fixture("lucid_payouts_2026-10-24.csv"));
    expect(p.kind).toBe("payouts");
    expect(p.errors).toEqual([]);
    if (p.kind !== "payouts") throw new Error();
    expect(p.rows).toHaveLength(12);
    expect(new Set(p.rows.map((r) => r.accountLabel)).size).toBe(7);
    expect(p.rows[0]).toMatchObject({ accountLabel: "PRO014", amount: "2000.00", status: "paid", requestedOn: "2026-10-22" });
  });
});

describe("errores por fila", () => {
  it("detecta montos, fechas, estados y órdenes repetidas", () => {
    const p = parseImport(
      "firm,external_ref,occurred_on,category,amount,currency,status\n" +
        "Lucid Trading,1,2026-10-01,evaluacion,105.20,USD,pagado\n" +
        "Lucid Trading,1,2026-10-01,evaluacion,105.20,USD,pagado\n" +
        "Lucid Trading,2,fecha,evaluacion,abc,USD,raro\n" +
        "Lucid Trading,3,2026-10-01,cafe,10,EUR,pagado\n",
    );
    expect(p.rows).toHaveLength(1);
    expect(p.errors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(p.errors[0].message).toMatch(/repetido/);
    expect(p.errors[1].message).toMatch(/fecha inválida.*monto inválido.*estado/);
    expect(p.errors[2].message).toMatch(/moneda EUR.*|categoría/);
  });
  it("formato desconocido", () => expect(parseImport("a,b\n1,2").kind).toBeNull());
});

describe("dólar por fila (fx_usd_clp)", () => {
  const head = "firm,external_ref,occurred_on,amount,currency,fx_usd_clp,fx_source\n";
  it("se lee con su fuente", () => {
    const r = parseImport(head + "Topstep,1,2026-08-13,95,USD,912,dolar_observado\nTopstep,2,2026-08-12,95,USD,914.41,\n");
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.fx)).toEqual([{ rate: "912", source: "dolar_observado" }, { rate: "914.41", source: "manual" }]);
  });
  it("vacío = se consulta el dólar como siempre", () => {
    expect(parseImport(head + "Topstep,1,2026-08-13,95,USD,,\n").rows[0].fx).toBeNull();
  });
  it("valor absurdo → error de la fila", () => {
    expect(parseImport(head + "Topstep,1,2026-08-13,95,USD,9.12,\n").errors[0].message).toMatch(/fx_usd_clp/);
  });
});
