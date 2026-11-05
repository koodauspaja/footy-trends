import { describe, expect, it } from "vitest";
import {
  BOARD_ROWS,
  type BoardEntry,
  RARITY_BONUS,
  rankBoard,
  rarityBonuses,
  type Settlement,
  sharesOf,
} from "@/lib/guessing-game";

/**
 * Arvauspeli's rules for playing against each other: the rarity bonus at its
 * boundaries, the shares and when they show, and the leaderboard's order.
 *
 * decisions/073-leaderboard.md
 */

function match(...settlements: Settlement[]) {
  return settlements.map((settlement, key) => ({ key, settlement }));
}

const misses = (count: number): Settlement[] => Array.from({ length: count }, () => "miss");

describe("rarityBonuses", () => {
  it("is worth 20 tokens", () => {
    expect(RARITY_BONUS).toBe(20);
  });

  it("pays a correct 1X2 shared by at most a quarter of 5 or more guesses", () => {
    expect(rarityBonuses(match("outcome", ...misses(4)))).toEqual([0]);
  });

  it("pays nothing with 4 guesses, however few were right", () => {
    expect(rarityBonuses(match("outcome", ...misses(3)))).toEqual([]);
  });

  it("pays at exactly a quarter, and not one more", () => {
    expect(rarityBonuses(match("exact", "difference", ...misses(6)))).toEqual([0, 1]);
    expect(rarityBonuses(match("exact", "difference", ...misses(5)))).toEqual([]);
  });

  it("counts every tier that has the 1X2 right as right", () => {
    expect(rarityBonuses(match("exact", ...misses(4)))).toEqual([0]);
    expect(rarityBonuses(match("difference", ...misses(4)))).toEqual([0]);
  });

  it("pays nothing when nobody was right", () => {
    expect(rarityBonuses(match(...misses(8)))).toEqual([]);
  });

  it("leaves void and refunded guesses out of the count", () => {
    // Four played guesses and two void: too few to pay, however rare the hit.
    expect(rarityBonuses(match("outcome", ...misses(3), "void", "void"))).toEqual([]);
    expect(rarityBonuses(match("outcome", ...misses(4), "void", "abandoned"))).toEqual([0]);
  });

  it("pays nothing on an awarded match", () => {
    expect(rarityBonuses(match("awarded", ...Array<Settlement>(7).fill("awarded")))).toEqual([]);
  });
});

describe("sharesOf", () => {
  it("shows nothing with fewer than 3 guesses", () => {
    expect(sharesOf({ "1": 1, X: 1 })).toBeNull();
    expect(sharesOf({})).toBeNull();
  });

  it("gives whole per cents of each outcome from 3 guesses up", () => {
    expect(sharesOf({ "1": 2, "2": 1 })).toEqual({ "1": 67, X: 0, "2": 33, total: 3 });
  });

  it("counts an outcome nobody guessed as 0", () => {
    expect(sharesOf({ X: 4 })).toEqual({ "1": 0, X: 100, "2": 0, total: 4 });
  });
});

function entry(userId: string, balance: number, nickname: string | null = userId): BoardEntry {
  return { userId, nickname, balance, settled: 0 };
}

describe("rankBoard", () => {
  it("ranks by balance, highest first", () => {
    const board = rankBoard([entry("b", 900), entry("a", 1100), entry("c", 1000)], null);

    expect(board.rows.map((row) => [row.rank, row.nickname])).toEqual([
      [1, "a"],
      [2, "c"],
      [3, "b"],
    ]);
    expect(board.players).toBe(3);
  });

  it("gives an equal balance one rank, and counts both for the next", () => {
    const board = rankBoard([entry("x", 1000), entry("y", 1200), entry("z", 1200)], null);

    expect(board.rows.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it("orders a tie by nickname in Finnish order, and no nickname last", () => {
    const board = rankBoard(
      [entry("u1", 1000, null), entry("u2", 1000, "Ätti"), entry("u3", 1000, "Zorro")],
      null
    );

    expect(board.rows.map((row) => row.nickname)).toEqual(["Zorro", "Ätti", null]);
  });

  it("keeps two players without a nickname in one order, each its own place", () => {
    const board = rankBoard([entry("u2", 1000, null), entry("u1", 1000, null)], "u1");

    expect(board.rows.map((row) => [row.place, row.self])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("marks the reader's row, and never shows a user id", () => {
    const board = rankBoard([entry("me", 1000), entry("other", 900)], "me");

    expect(board.rows.map((row) => row.self)).toEqual([true, false]);
    expect(JSON.stringify(board)).not.toContain('"userId"');
  });

  it("shows the first 50, and the reader's own row after them when it is further down", () => {
    const players = Array.from({ length: BOARD_ROWS + 5 }, (_, index) =>
      entry(`u${index}`, 10_000 - index)
    );
    const board = rankBoard(players, "u52");

    expect(board.rows).toHaveLength(BOARD_ROWS);
    expect(board.own).toMatchObject({ rank: 53, place: 53, self: true });
    expect(board.players).toBe(BOARD_ROWS + 5);
  });

  it("shows the reader's row only in place when it is among the first 50", () => {
    const players = Array.from({ length: BOARD_ROWS + 1 }, (_, index) =>
      entry(`u${index}`, 10_000 - index)
    );

    expect(rankBoard(players, `u${BOARD_ROWS - 1}`).own).toBeNull();
    expect(rankBoard(players, `u${BOARD_ROWS}`).own).toMatchObject({ place: BOARD_ROWS + 1 });
  });

  it("has no own row for a reader who is not on the board", () => {
    expect(rankBoard([entry("a", 1000)], "someone-else").own).toBeNull();
    expect(rankBoard([], "me")).toEqual({ rows: [], own: null, players: 0 });
  });
});
