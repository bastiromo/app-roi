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
