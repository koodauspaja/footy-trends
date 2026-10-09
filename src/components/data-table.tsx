import type { ReactNode } from "react";

/**
 * The width scale every table column is sized from. Fixed widths are what make
 * sibling tables line up.
 *
 * decisions/021-table-consistency.md
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
 *
 * decisions/021-table-consistency.md
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
  /** The one row a page is about, shaded and marked `aria-current`. */
  isCurrentRow?: (row: T) => boolean;
};

/**
 * The floor: every fixed column, plus the least the flexible one may have.
 *
 * decisions/021-table-consistency.md
 */
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
 * The table both the standings and the match lists render through:
 * `table-fixed` with a `<colgroup>`. Below the floor the wrapper scrolls
 * sideways; nothing is hidden or truncated.
 *
 * decisions/021-table-consistency.md
 * decisions/049-home-advantage-and-draw-rate.md
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  isCurrentRow = () => false,
}: Readonly<DataTableProps<T>>) {
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
          <tr className="border-border border-b text-sm text-muted">
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
            <tr
              aria-current={isCurrentRow(row) ? "true" : undefined}
              className={`border-border-subtle border-b${isCurrentRow(row) ? " bg-surface font-semibold" : ""}`}
              key={rowKey(row)}
            >
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
