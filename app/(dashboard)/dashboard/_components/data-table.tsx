import React, { useState, useCallback } from "react";
import {
  ColumnDef,
  flexRender,
  getPaginationRowModel,
  getCoreRowModel,
  SortingState,
  getSortedRowModel,
  useReactTable,
  ColumnFiltersState,
  getFilteredRowModel,
  FilterFn,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Download, Search, Calendar, X, Filter, File, FileEdit, Database } from "lucide-react";
import Link from "next/link";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface DateRange {
  from: string;
  to: string;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  createLabel?: string;
  createLink?: string;
  noResultsLabel?: string;
  hasEndDate?: boolean;
  searchColumn?: string;
  showCreateButton?: boolean;
}

// Custom date filter function
const dateRangeFilter: FilterFn<any> = (row, columnId, filterValue: DateRange) => {
  const { from, to } = filterValue;

  // If no date range is provided, return true (no filtering)
  if (!from && !to) return true;

  const cellValue = row.getValue(columnId);
  if (!cellValue) return false; // If the cell value is empty, exclude it

  const cellDate = new Date(cellValue);
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  // Normalize dates to midnight for accurate comparison
  if (fromDate) fromDate.setHours(0, 0, 0, 0);
  if (toDate) toDate.setHours(23, 59, 59, 999); // End of the day
  cellDate.setHours(0, 0, 0, 0);

  // Apply filtering logic
  if (fromDate && toDate) {
    return cellDate >= fromDate && cellDate <= toDate;
  } else if (fromDate) {
    return cellDate >= fromDate;
  } else if (toDate) {
    return cellDate <= toDate;
  }

  return true; // Default to no filtering
};

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  createLabel = "Create New",
  createLink = "#",
  noResultsLabel = "No results found",
  hasEndDate = false,
  searchColumn = "title",
  showCreateButton = true,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [searchValue, setSearchValue] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: "", to: "" });
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    state: {
      sorting,
      columnFilters,
    },
    filterFns: {
      dateRange: dateRangeFilter,
    },
  });

  const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSearchValue(value);
    table.getColumn(searchColumn)?.setFilterValue(value);
    updateActiveFilters("بحث", value);
  }, [searchColumn, table]);

  const handleDateChange = useCallback((key: keyof DateRange, value: string) => {
    setDateRange(prev => ({ ...prev, [key]: value }));
  }, []);

  const updateActiveFilters = useCallback((type: string, value: any) => {
    setActiveFilters(prev => {
      const newFilters = prev.filter(f => !f.startsWith(type));
      if (value) {
        if (type === "تاريخ") {
          const { from, to } = value as DateRange;
          if (from || to) {
            newFilters.push(`تاريخ: ${from}${to ? ` الي ${to}` : ""}`);
          }
        } else if (type === "بحث" && value.trim()) {
          newFilters.push(`بحث: ${value}`);
        }
      }
      return newFilters;
    });
  }, []);

  const applyDateFilter = useCallback(() => {
    const dateColumn = table.getColumn("endDate");
    if (dateColumn) {
      dateColumn.setFilterValue(dateRange);
      if (dateRange.from || dateRange.to) {
        updateActiveFilters("تاريخ", dateRange);
      }
    }
    setIsDateFilterOpen(false);
  }, [dateRange, table, updateActiveFilters]);

  const clearAllFilters = useCallback(() => {
    setSearchValue("");
    setDateRange({ from: "", to: "" });
    setActiveFilters([]);
    table.resetColumnFilters();
  }, [table]);

  const clearSingleFilter = useCallback((filter: string) => {
    const [type] = filter.split(":");
    if (type === "بحث") {
      setSearchValue("");
      table.getColumn(searchColumn)?.setFilterValue("");
    } else if (type === "تاريخ") {
      setDateRange({ from: "", to: "" });
      table.getColumn("endDate")?.setFilterValue({ from: "", to: "" });
    }
    setActiveFilters(prev => prev.filter(f => f !== filter));
  }, [searchColumn, table]);

  // Function to export table data as CSV
  const exportToCSV = useCallback(() => {
    const filteredData = table.getFilteredRowModel().rows.map(row => row.original);
    const headers = columns.map(column => column.header);
    const csvContent = [
      headers.join(","),
      ...filteredData.map(row =>
        columns.map(column => {
          const value = row[column.accessorKey as keyof typeof row];
          return typeof value === "string" || typeof value === "number" ? value : "";
        }).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "data.csv";
    link.click();
  }, [table, columns]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={handleSearch}
              className="pl-8"
            />
          </div>

          {hasEndDate && (
            <Dialog open={isDateFilterOpen} onOpenChange={setIsDateFilterOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 hover:bg-brand/8 transition-colors"
                >
                  <Calendar className="h-4 w-4 text-black" />
                  <span className="text-black font-medium">فلتر تاريخ</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-lg shadow-lg max-w-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    حدد نطاق التاريخ
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDateRange({ from: "", to: "" });
                      updateActiveFilters("تاريخ", null);
                    }}
                    className="h-8 px-2 text-gray-500 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="space-y-2 flex-1">
                    <label className="text-sm font-medium text-gray-700">
                      من تاريخ
                    </label>
                    <Input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => handleDateChange("from", e.target.value)}
                      className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <label className="text-sm font-medium text-gray-700">
                      إلى تاريخ
                    </label>
                    <Input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => handleDateChange("to", e.target.value)}
                      className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black transition-all"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setIsDateFilterOpen(false)}
                    className="flex-1 hover:bg-gray-100 transition-colors"
                  >
                    إلغاء
                  </Button>
                  <Button
                    onClick={applyDateFilter}
                    className="flex-1 bg-black hover:bg-brand-dark text-white transition-colors"
                  >
                    تأكيد الفلتر
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

        </div>
<div className="flex gap-2">

          {showCreateButton && (
            <Link href={createLink}>
              <Button className="flex gap-2 items-center bg-black">
                <PlusCircle size={20} />
                {createLabel}
              </Button>
            </Link>
          )}
        <Button
          variant="outline"
          onClick={exportToCSV}
          className="flex items-center gap-2"
        >
          <Database className="h-4 w-4" />
          استخراج بيانات
        </Button>
</div>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-700">التصفيات المفعلة</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <Badge
                key={filter}
                variant="secondary"
                className="flex items-center gap-1 bg-gray-100 text-gray-700"
              >
                {filter}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearSingleFilter(filter)}
                  className="h-4 w-4 p-0 hover:bg-transparent"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="h-6 px-2 text-gray-500 hover:text-gray-700"
            >
              Clear all
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="text-right font-semibold"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {noResultsLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          السابق
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          التالي
        </Button>
      </div>
    </div>
  );
}

export default DataTable;