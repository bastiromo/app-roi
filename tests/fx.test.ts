import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
import { parseMindicador } from "../src/lib/fx";

describe("respuesta de mindicador.cl", () => {
  it("lee fecha y valor", () =>
    expect(parseMindicador({ serie: [{ fecha: "2026-10-15T03:00:00.000Z", valor: 945.3 }] })).toEqual({ fecha: "2026-10-15", valor: "945.30" }));
  it("serie vacía (fin de semana) → null", () => expect(parseMindicador({ serie: [] })).toBeNull());
  it("basura → null", () => expect(parseMindicador("x")).toBeNull());
});

import { parseSeries, pickRate } from "../src/lib/fx";

describe("serie anual (respaldo cuando falla la consulta por día)", () => {
  const series = parseSeries({
    serie: [
      { fecha: "2026-08-14T04:00:00.000Z", valor: 940.1 },
      { fecha: "2026-08-13T04:00:00.000Z", valor: 938.55 },
      { fecha: "2026-08-12T04:00:00.000Z", valor: 941 },
      { fecha: "2026-08-03T04:00:00.000Z", valor: 930 },
      { fecha: "x", valor: -1 },
    ],
  });
  it("lee solo valores válidos", () => expect(series).toHaveLength(4));
  it("fecha exacta", () => expect(pickRate(series, "2026-08-13")).toEqual({ fecha: "2026-08-13", valor: "938.55" }));
  it("fin de semana → último día hábil anterior", () => expect(pickRate(series, "2026-08-16")).toEqual({ fecha: "2026-08-14", valor: "940.10" }));
  it("nada en los 7 días previos → null", () => expect(pickRate(series, "2026-08-11")).toBeNull());
  it("nunca toma una fecha posterior", () => expect(pickRate(series, "2026-08-02")).toBeNull());
});
