import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getMissionsData } from "@/actions/missions";

function buildXLSX(rows: (string | number)[][]): Blob {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const colCount = rows[0]?.length ?? 0;
  ws["!cols"] = Array.from({ length: colCount }, (_, c) => ({
    wch: Math.min(
      rows.reduce((w, r) => Math.max(w, String(r[c] ?? "").length), 10) + 2,
      50
    ),
  }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" } as any;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const arr = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Blob([arr], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "ready";

  try {
    const data = await getMissionsData();
    let rows: (string | number)[][];
    let filename: string;

    if (type === "notready") {
      rows = [
        ["First Name", "Last Name", "Sessions Attended", "Sessions Required", "Sessions Needed"],
        ...data.notReady.map((m) => [
          m.first_name, m.last_name,
          m.sessions_attended, m.sessions_required, m.needs,
        ]),
      ];
      filename = "cla-missions-not-ready.xlsx";
    } else {
      rows = [
        ["First Name", "Last Name", "Phone", "Email", "Class", "Slot", "Sessions Attended", "Sessions Required"],
        ...data.ready.map((m) => [
          m.first_name, m.last_name, m.phone, m.email ?? "",
          m.class_name ?? "", m.slot ?? "",
          m.sessions_attended, m.sessions_required,
        ]),
      ];
      filename = "cla-missions-ready.xlsx";
    }

    const blob = buildXLSX(rows);
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unauthorized" }, { status: 401 });
  }
}
