import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  COLUMN_WIDTHS,
  DataTable,
  type DataTableColumn,
  tableMinWidth,
} from "@/components/data-table";

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
    expect(container.querySelector("table")?.style.minWidth).toBe(
      `${COLUMN_WIDTHS.flexMinimum + COLUMN_WIDTHS.stat}px`
    );
    expect(tableMinWidth(columns)).toBe(COLUMN_WIDTHS.flexMinimum + COLUMN_WIDTHS.stat);
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
});
