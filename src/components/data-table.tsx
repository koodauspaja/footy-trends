import type { ReactNode } from "react";
import type { ZoneKind } from "@/lib/competition-zones";

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
 * A row's tint and the 4 px edge on its first cell, by kind. Written out whole
 * so Tailwind finds each class; the colours are the theme's zone tokens.
 *
 * decisions/065-foreign-league-zones.md
 */
const ZONE_CLASSES: Record<ZoneKind, { row: string; edge: string }> = {
  cup: {
    row: "bg-zone-cup-background",
    edge: "shadow-[inset_4px_0_0_var(--zone-cup-edge)]",
  },
  promotion: {
    row: "bg-zone-promotion-background",
    edge: "shadow-[inset_4px_0_0_var(--zone-promotion-edge)]",
  },
  playoff: {
    row: "bg-zone-playoff-background",
    edge: "shadow-[inset_4px_0_0_var(--zone-playoff-edge)]",
  },
  relegation: {
    row: "bg-zone-relegation-background",
    edge: "shadow-[inset_4px_0_0_var(--zone-relegation-edge)]",
  },
};

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
  /** A heavier rule under this row: the next row belongs to another stretch of the table. */
  hasRuleBelow?: (row: T, index: number) => boolean;
  /** The kind of zone this row sits in: a tint across the row and an edge on its first cell. */
  zoneKindOf?: (row: T, index: number) => ZoneKind | undefined;
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

function zoneClassesOf(kind: ZoneKind | undefined) {
  return kind === undefined ? undefined : ZONE_CLASSES[kind];
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
 * decisions/063-competition-zones.md
 * decisions/065-foreign-league-zones.md
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  isCurrentRow = () => false,
  hasRuleBelow = () => false,
  zoneKindOf = () => undefined,
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
          {rows.map((row, index) => {
            // The row a page is about keeps its shade: two backgrounds on one row are decided by the stylesheet's order, not the class string's.
            const zone = isCurrentRow(row) ? undefined : zoneClassesOf(zoneKindOf(row, index));
            return (
              <tr
                aria-current={isCurrentRow(row) ? "true" : undefined}
                className={[
                  hasRuleBelow(row, index)
                    ? "border-muted border-b-2"
                    : "border-border-subtle border-b",
                  zone?.row,
                  isCurrentRow(row) ? "bg-surface font-semibold" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={rowKey(row)}
              >
                {columns.map((column, columnIndex) => {
                  const className = [
                    "p-3",
                    alignClass(column.align),
                    column.cellClassName,
                    columnIndex === 0 ? zone?.edge : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ");
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
