import type { ReactNode } from "react";

/**
 * The width scale every table column is sized from.
 *
 * Fixed widths exist so that **sibling tables line up**. Browser auto layout
 * sizes each column from its own table's rows, so three phases of one
 * competition rendered one above the other drifted apart — measured at 1280px
 * on `/kotimaa/sarjataulukko?kilpailu=VL&kausi=2019`, two match lists were
 * 20, 47, 12 and 14 pixels apart column by column, and twelve World Cup group
 * tables spread their name column across 663–669px. See
 * specs/021-table-consistency.md.
 *
 * The numbers are chosen to keep the standings' floor near the 760px it has
 * always had: 64 + 8×44 + 112 fixed, plus a 240px minimum for the flexible
 * column, is 768.
 */
export const COLUMN_WIDTHS = {
  /** `Sija`, which holds at most three digits. */
  position: 64,
  /** One standings statistic — `O`, `V`, `TM`, `P`. */
  stat: 44,
  /** `Vire`, five single-letter results. */
  form: 112,
  /** `Pvm`, a `dd.mm.yyyy` date. */
  date: 112,
  /** `Tulos`, wide enough for `10–8 (rp 4–3)` to wrap rather than clip. */
  score: 104,
  /** The match list's fourth column — `Kierros`, `Sarja` or `Kilpailu`. */
  label: 128,
  /** The least the flexible column may take before the table starts scrolling. */
  flexMinimum: 240,
} as const;

/**
 * One column. Exactly one column in a table carries `width: "flex"` and takes
 * whatever the container leaves; every other width comes from the scale above.
 */
export type DataTableColumn<T> = {
  /** Stable across renders, and unique within the table. */
  key: string;
  header: ReactNode;
  /** The `title` a header abbreviation expands to, where it has one. */
  headerTitle?: string;
  width: number | "flex";
  /** Numbers go right so digits line up by place value. Text stays left. */
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Extra classes for this column's cells — weight, nothing structural. */
  cellClassName?: string;
  /** Renders the cell as a row header, which the team name is. */
  rowHeader?: boolean;
  /** A label for a cell whose content is not readable on its own, like `Vire`. */
  cellLabel?: (row: T) => string;
};

export type DataTableProps<T> = {
  rows: readonly T[];
  columns: ReadonlyArray<DataTableColumn<T>>;
  rowKey: (row: T) => string | number;
};

/** The floor: every fixed column, plus the least the flexible one may have. */
export function tableMinWidth<T>(columns: ReadonlyArray<DataTableColumn<T>>): number {
  return columns.reduce(
    (total, column) => total + (column.width === "flex" ? COLUMN_WIDTHS.flexMinimum : column.width),
    0
  );
}

function alignClass(align: DataTableColumn<unknown>["align"]): string {
  return align === "right" ? "text-right" : "text-left";
}

/**
 * The table both the standings and the match lists render through.
 *
 * `table-fixed` with a `<colgroup>` is what makes the widths declarations
 * rather than suggestions: the browser stops measuring content, so two tables
 * with the same columns are identical whatever their rows say. The flexible
 * column absorbs the rest, so a wide screen still gives the team name the room
 * and the numbers stay grouped.
 *
 * Below the floor the wrapper scrolls sideways. Nothing is hidden and nothing is
 * truncated: a long name wraps inside its column instead.
 */
export function DataTable<T>({ rows, columns, rowKey }: Readonly<DataTableProps<T>>) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full table-fixed border-collapse text-left"
        style={{ minWidth: `${tableMinWidth(columns)}px` }}
      >
        <colgroup>
          {columns.map((column) => (
            <col
              key={column.key}
              style={column.width === "flex" ? undefined : { width: `${column.width}px` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr className="border-zinc-300 border-b text-sm text-zinc-600">
            {columns.map((column) => (
              <th
                className={`p-3 ${alignClass(column.align)}`}
                key={column.key}
                title={column.headerTitle}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-zinc-200 border-b" key={rowKey(row)}>
              {columns.map((column) => {
                const className =
                  `p-3 ${alignClass(column.align)} ${column.cellClassName ?? ""}`.trim();
                return column.rowHeader ? (
                  <th className={className} key={column.key} scope="row">
                    {column.render(row)}
                  </th>
                ) : (
                  <td aria-label={column.cellLabel?.(row)} className={className} key={column.key}>
                    {column.render(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
