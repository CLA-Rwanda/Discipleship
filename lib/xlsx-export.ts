import * as XLSX from "xlsx";

/**
 * Download a 2-D array as a formatted .xlsx file.
 * First row is treated as the header and gets auto-sized columns.
 */
export function downloadXLSX(rows: (string | number | null | undefined)[][], filename: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto column widths based on longest value per column
  if (rows.length > 0) {
    const colCount = rows[0].length;
    ws["!cols"] = Array.from({ length: colCount }, (_, c) => {
      const max = rows.reduce((w, row) => {
        const val = row[c] == null ? "" : String(row[c]);
        return Math.max(w, val.length);
      }, 10);
      return { wch: Math.min(max + 2, 50) };
    });
  }

  // Freeze the header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" } as any;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename + ".xlsx");
}
