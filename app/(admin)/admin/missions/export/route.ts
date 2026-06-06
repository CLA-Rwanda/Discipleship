import { NextRequest, NextResponse } from "next/server";
import { getMissionsData } from "@/actions/missions";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "ready";

  let csv: string;
  let filename: string;

  try {
    const data = await getMissionsData();

    if (type === "notready") {
      const rows = [
        ["First Name", "Last Name", "Sessions Attended", "Sessions Required", "Sessions Needed"],
        ...data.notReady.map((m) => [
          m.first_name,
          m.last_name,
          m.sessions_attended,
          m.sessions_required,
          m.needs,
        ]),
      ];
      csv = rows.map((r) => r.join(",")).join("\n");
      filename = "cla-missions-not-ready.csv";
    } else {
      const rows = [
        ["First Name", "Last Name", "Phone", "Email", "Class", "Slot", "Sessions Attended", "Sessions Required"],
        ...data.ready.map((m) => [
          m.first_name,
          m.last_name,
          m.phone,
          m.email ?? "",
          m.class_name ?? "",
          m.slot ?? "",
          m.sessions_attended,
          m.sessions_required,
        ]),
      ];
      csv = rows.map((r) => r.join(",")).join("\n");
      filename = "cla-missions-ready.csv";
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unauthorized" }, { status: 401 });
  }
}
