import { describe, expect, it } from "vitest";
import { countWithdrawals, withdrawalStage } from "../src/domain/withdrawals";

describe("retiros por cuenta", () => {
  const m = countWithdrawals([
    { account_id: "PRO014", status: "paid" },
    { account_id: "PRO016", status: "paid" },
    { account_id: "PRO016", status: "requested" },
    { account_id: "PRO016", status: "rejected" }, // no cuenta
    { account_id: "PRO020", status: "cancelled" }, // no cuenta
  ]);

  it("pagados y en proceso; rechazados y cancelados no cuentan", () => {
    expect(m.get("PRO014")).toEqual({ paid: 1, inProcess: 0 });
    expect(m.get("PRO016")).toEqual({ paid: 1, inProcess: 1 });
    expect(m.has("PRO020")).toBe(false);
  });

  it("1 de 4: quedan 3", () => {
    expect(withdrawalStage({ paid: 1, inProcess: 0 }, 4)).toEqual({ used: 1, left: 3, stage: "open" });
  });
  it("el que está en proceso ya cuenta como usado", () => {
    expect(withdrawalStage({ paid: 2, inProcess: 1 }, 4)).toEqual({ used: 3, left: 1, stage: "last" });
  });
  it("al máximo: toca cerrarla (nunca negativo)", () => {
    expect(withdrawalStage({ paid: 4, inProcess: 0 }, 4).stage).toBe("done");
    expect(withdrawalStage({ paid: 5, inProcess: 0 }, 4).left).toBe(0);
  });
  it("sin límite configurado", () => {
    expect(withdrawalStage({ paid: 2, inProcess: 0 }, null)).toEqual({ used: 2, left: null, stage: "open" });
  });
});
