/**
 * A leaderboard's table: rank, nickname, balance and settled guesses, the
 * reader's own row bold, and after the first 50 their own row when it is
 * further down. The public board and a group's board both show it.
 *
 * decisions/073-leaderboard.md
 * decisions/078-private-groups.md
 */

import type { Board, BoardRow } from "@/lib/guessing-game";

const tokens = new Intl.NumberFormat("fi-FI");

function BoardTableRow({ row }: Readonly<{ row: BoardRow }>) {
  return (
    <tr className={`border-border-subtle border-b ${row.self ? "font-semibold" : ""}`}>
      <td className="py-2 pr-4 tabular-nums">{row.rank}.</td>
      <td className="py-2 pr-4">
        {row.nickname ?? "Nimetön pelaaja"}
        {row.self && <span className="text-muted"> (sinä)</span>}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{tokens.format(row.balance)}</td>
      <td className="py-2 text-right tabular-nums">{row.settled}</td>
    </tr>
  );
}

export function BoardTable({ board }: Readonly<{ board: Board }>) {
  return (
    <div className="scroll-edge overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border border-b">
            <th className="py-2 pr-4">Sija</th>
            <th className="py-2 pr-4">Pelaaja</th>
            <th className="py-2 pr-4 text-right">Pelimerkit</th>
            <th className="py-2 text-right">Ratkaistut</th>
          </tr>
        </thead>
        <tbody>
          {board.rows.map((row) => (
            <BoardTableRow key={row.place} row={row} />
          ))}
          {board.own !== null && (
            <>
              <tr>
                <td className="py-1 text-muted" colSpan={4}>
                  …
                </td>
              </tr>
              <BoardTableRow row={board.own} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
