import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeasonMovement } from "@/lib/table-volatility";

const { getSeasonMovements, getTasoSeasonMovements, loggerError } = vi.hoisted(() => ({
  getSeasonMovements: vi.fn<() => Promise<SeasonMovement[]>>(),
  getTasoSeasonMovements: vi.fn<() => Promise<SeasonMovement[]>>(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/standings-service", () => ({ getSeasonMovements }));
vi.mock("@/lib/taso-standings-service", () => ({ getTasoSeasonMovements }));
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError } }));

import { getTableVolatility } from "@/lib/table-volatility-service";

const seasons: SeasonMovement[] = [
  { seasonId: 2023, movement: { total: 30, teams: 20 } },
  { seasonId: 2024, movement: { total: 40, teams: 20 } },
];

beforeEach(() => {
  vi.clearAllMocks();
  getSeasonMovements.mockResolvedValue(seasons);
  getTasoSeasonMovements.mockResolvedValue(seasons);
});

describe("getTableVolatility (specs/050)", () => {
  it.each([
    ["football-data", "PL", getSeasonMovements, getTasoSeasonMovements],
    ["taso", "VL", getTasoSeasonMovements, getSeasonMovements],
  ] as const)(
    "reads a %s competition from its own provider's store",
    async (kind, code, used, unused) => {
      const series = await getTableVolatility(kind, code, 2025);

      expect(used).toHaveBeenCalledWith(code, 2025);
      expect(unused).not.toHaveBeenCalled();
      expect(series).toMatchObject({
        status: "ok",
        points: [
          { seasonId: 2023, change: 1.5 },
          { seasonId: 2024, change: 2 },
        ],
      });
    }
  );

  it("turns a failed read into its own case, not too few", async () => {
    getTasoSeasonMovements.mockRejectedValue(new Error("connection reset"));

    await expect(getTableVolatility("taso", "VL", 2026)).resolves.toEqual({ status: "error" });
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), code: "VL" }),
      "Unable to read the competition's table movement"
    );
  });
});
