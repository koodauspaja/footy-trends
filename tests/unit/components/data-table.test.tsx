import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  COLUMN_WIDTHS,
  DataTable,
  type DataTableColumn,
  phoneTableMinWidth,
  tableMinWidth,
} from "@/components/data-table";

/**
 * The shared table: its columns come from one scale.
 *
 * decisions/021-table-consistency.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/063-competition-zones.md
 * decisions/699-narrow-tables.md
 */

type Row = { id: number; name: string; points: number };

const rows: Row[] = [
  { id: 1, name: "HJK", points: 59 },
  { id: 2, name: "KuPS", points: 8 },
];

const columns: Array<DataTableColumn<Row>> = [
  { key: "name", header: "Joukkue", width: "flex", rowHeader: true, render: (row) => row.name },
  {
    key: "points",
    header: "P",
    headerTitle: "Pisteet",
    width: COLUMN_WIDTHS.stat,
    align: "right",
    cellClassName: "font-semibold",
    render: (row) => row.points,
  },
];

// One more stat column, keyed by what it counts.
function stat(key: string): DataTableColumn<Row> {
  return { key, header: key, width: COLUMN_WIDTHS.stat, align: "right", render: () => 0 };
}

describe("DataTable", () => {
  it("renders the headers it is given, in order", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["Joukkue", "P"]);
  });

  it("expands an abbreviated header through its title", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);

    expect(screen.getByRole("columnheader", { name: "P" })).toHaveAttribute("title", "Pisteet");
  });

  it("right-aligns only the columns that declare it", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);

    expect(screen.getByRole("columnheader", { name: "Joukkue" })).toHaveClass("text-left");
    expect(screen.getByRole("columnheader", { name: "P" })).toHaveClass("text-right");
    expect(screen.getByRole("cell", { name: "59" })).toHaveClass("text-right");
  });

  it("declares every fixed width, and leaves the flexible column undeclared", () => {
    const { container } = render(
      <DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />
    );

    const cols = [...container.querySelectorAll("col")];
    expect(cols).toHaveLength(2);
    expect(cols[0]?.getAttribute("style")).toBeNull();
    expect(cols[1]?.style.width).toBe(`${COLUMN_WIDTHS.stat}px`);
  });

  it("floors the table at its fixed widths plus the flexible column's minimum", () => {
    const { container } = render(
      <DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />
    );

    // This is what stops a table sizing itself from its own rows.
    const table = container.querySelector("table");
    expect(table?.style.getPropertyValue("--table-floor")).toBe(
      `${COLUMN_WIDTHS.flexMinimum + COLUMN_WIDTHS.stat}px`
    );
    expect(table).toHaveClass("sm:min-w-(--table-floor)");
    expect(tableMinWidth(columns)).toBe(COLUMN_WIDTHS.flexMinimum + COLUMN_WIDTHS.stat);
  });

  it("floors a phone's table at the columns it keeps, the flexible one narrower", () => {
    const withDraws: Array<DataTableColumn<Row>> = [
      ...columns,
      { ...stat("drawn"), hideOnPhone: true },
    ];
    const { container } = render(
      <DataTable columns={withDraws} rowKey={(row) => row.id} rows={rows} />
    );
    const table = container.querySelector("table");

    expect(table?.style.getPropertyValue("--table-floor-phone")).toBe(
      `${COLUMN_WIDTHS.flexMinimumPhone + COLUMN_WIDTHS.stat}px`
    );
    expect(table).toHaveClass("min-w-(--table-floor-phone)");
    expect(phoneTableMinWidth(withDraws)).toBe(COLUMN_WIDTHS.flexMinimumPhone + COLUMN_WIDTHS.stat);
  });

  it("leaves a phone-hidden column out below sm, its col, header and cells alike", () => {
    const withDraws: Array<DataTableColumn<Row>> = [
      ...columns,
      { ...stat("drawn"), hideOnPhone: true },
    ];
    const { container } = render(
      <DataTable columns={withDraws} rowKey={(row) => row.id} rows={rows} />
    );
    const hidden = (selector: string) =>
      [...container.querySelectorAll(selector)].map((element) =>
        element.classList.contains("max-sm:hidden")
      );

    expect(hidden("col")).toEqual([false, false, true]);
    expect(hidden("thead th")).toEqual([false, false, true]);
    for (const row of container.querySelectorAll("tbody tr")) {
      expect([...row.children].map((cell) => cell.classList.contains("max-sm:hidden"))).toEqual([
        false,
        false,
        true,
      ]);
    }
  });

  it("shadows the edge its wrapper scrolls towards", () => {
    const { container } = render(
      <DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />
    );

    expect(container.querySelector("table")?.parentElement).toHaveClass(
      "scroll-edge",
      "overflow-x-auto"
    );
  });

  it("renders a declared row header as a header cell, not a data cell", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);

    expect(screen.getByRole("rowheader", { name: "HJK" })).toBeInTheDocument();
  });

  it("labels a cell whose content cannot be read on its own", () => {
    const labelled: Array<DataTableColumn<Row>> = [
      {
        key: "form",
        header: "Vire",
        width: 100,
        cellLabel: (row) => `${row.name} form`,
        render: () => "V V",
      },
    ];
    render(<DataTable columns={labelled} rowKey={(row) => row.id} rows={rows} />);

    expect(screen.getByRole("cell", { name: "HJK form" })).toBeInTheDocument();
  });

  it("renders nothing but headers for an empty list", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={[]} />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.queryByRole("cell")).not.toBeInTheDocument();
  });

  it("marks the current row, and only it, for the eye and for a screen reader", () => {
    render(
      <DataTable
        columns={columns}
        isCurrentRow={(row) => row.id === 2}
        rowKey={(row) => row.id}
        rows={rows}
      />
    );
    const [hjk, kups] = screen.getAllByRole("row").slice(1);

    expect(kups).toHaveAttribute("aria-current", "true");
    expect(kups).toHaveClass("bg-surface", "font-semibold");
    expect(hjk).not.toHaveAttribute("aria-current");
    expect(hjk).not.toHaveClass("bg-surface");
  });

  it("marks no row unless asked", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);

    expect(screen.getAllByRole("row").filter((row) => row.hasAttribute("aria-current"))).toEqual(
      []
    );
  });
});

describe("DataTable rules between rows", () => {
  it("draws a heavier rule under the rows it is asked to, by row and by index", () => {
    const hasRuleBelow = vi.fn((_row: unknown, index: number) => index === 0);
    render(
      <DataTable
        columns={columns}
        hasRuleBelow={hasRuleBelow}
        rowKey={(row) => row.id}
        rows={rows}
      />
    );
    const [first, second] = screen.getAllByRole("row").slice(1);

    expect(first).toHaveClass("border-muted", "border-b-2");
    expect(first).not.toHaveClass("border-border-subtle", "border-b");
    expect(second).toHaveClass("border-border-subtle", "border-b");
    expect(second).not.toHaveClass("border-b-2");
    expect(hasRuleBelow).toHaveBeenCalledWith(rows[0], 0);
    expect(hasRuleBelow).toHaveBeenCalledWith(rows[1], 1);
  });

  it("draws every row with the ordinary rule unless asked", () => {
    render(<DataTable columns={columns} rowKey={(row) => row.id} rows={rows} />);

    for (const row of screen.getAllByRole("row").slice(1)) {
      expect(row.className).toBe("border-border-subtle border-b");
    }
  });

  it("keeps the rule on the row a page is about", () => {
    render(
      <DataTable
        columns={columns}
        hasRuleBelow={() => true}
        isCurrentRow={() => true}
        rowKey={(row) => row.id}
        rows={rows}
      />
    );

    expect(screen.getAllByRole("row")[1]?.className).toBe(
      "border-muted border-b-2 bg-surface font-semibold"
    );
  });
});

describe("DataTable zone tint", () => {
  const three: Row[] = [...rows, { id: 3, name: "Ilves", points: 3 }];

  it("tints a row by its kind and draws the edge on its first cell only", () => {
    render(
      <DataTable
        columns={columns}
        rowKey={(row) => row.id}
        rows={three}
        zoneKindOf={(row) => (row.id === 2 ? "relegation" : undefined)}
      />
    );

    const [, first, second, third] = screen.getAllByRole("row");
    expect(first?.className).toBe("border-border-subtle border-b");
    expect(third?.className).toBe("border-border-subtle border-b");
    expect(second).toHaveClass("bg-zone-relegation-background");
    const cells = [...(second?.children ?? [])];
    expect(cells[0]).toHaveClass("shadow-[inset_4px_0_0_var(--zone-relegation-edge)]");
    expect(cells[1]?.className).not.toContain("shadow-");
    expect(first?.firstElementChild?.className).not.toContain("shadow-");
  });

  it.each([
    ["cup", "bg-zone-cup-background", "shadow-[inset_4px_0_0_var(--zone-cup-edge)]"],
    [
      "promotion",
      "bg-zone-promotion-background",
      "shadow-[inset_4px_0_0_var(--zone-promotion-edge)]",
    ],
    ["playoff", "bg-zone-playoff-background", "shadow-[inset_4px_0_0_var(--zone-playoff-edge)]"],
    [
      "relegation",
      "bg-zone-relegation-background",
      "shadow-[inset_4px_0_0_var(--zone-relegation-edge)]",
    ],
  ] as const)("paints a %s row with its own tint and edge", (kind, tint, edge) => {
    render(
      <DataTable
        columns={columns}
        rowKey={(row) => row.id}
        rows={rows.slice(0, 1)}
        zoneKindOf={() => kind}
      />
    );

    const row = screen.getAllByRole("row")[1];
    expect(row).toHaveClass(tint);
    expect(row?.firstElementChild).toHaveClass(edge);
  });

  it("asks for the row's index, and leaves an untinted row as it was", () => {
    const zoneKindOf = vi.fn(() => undefined);
    render(
      <DataTable columns={columns} rowKey={(row) => row.id} rows={rows} zoneKindOf={zoneKindOf} />
    );

    expect(zoneKindOf).toHaveBeenCalledWith(rows[1], 1);
    for (const row of screen.getAllByRole("row").slice(1)) {
      expect(row.className).toBe("border-border-subtle border-b");
    }
  });

  it("lets the current row's shade win over a tint, and keeps the zone's edge", () => {
    render(
      <DataTable
        columns={columns}
        hasRuleBelow={() => true}
        isCurrentRow={() => true}
        rowKey={(row) => row.id}
        rows={rows.slice(0, 1)}
        zoneKindOf={() => "cup"}
      />
    );

    const row = screen.getAllByRole("row")[1];
    expect(row?.className).toBe("border-muted border-b-2 bg-surface font-semibold");
    expect(row?.firstElementChild).toHaveClass("shadow-[inset_4px_0_0_var(--zone-cup-edge)]");
  });
});
