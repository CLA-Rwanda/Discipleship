import { Resend } from "resend";

let _resend: Resend | null = null;
export function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set in environment variables.");
    _resend = new Resend(key);
  }
  return _resend;
}

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "CLA Discipleship <reports@cla.org>";

export function buildReportEmail(data: {
  facilitatorName: string;
  dateFrom: string;
  dateTo: string;
  classes: {
    name: string;
    slot: string;
    attendanceCount: number;
    members: { name: string; attended_at: string }[];
  }[];
  totalAttendance: number;
}): string {
  const { facilitatorName, dateFrom, dateTo, classes, totalAttendance } = data;

  const classRows = classes
    .map(
      (cls) => `
    <div style="margin-bottom:28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px 14px;background:#2E0A0A;border-left:3px solid #D4860A;border-radius:6px 6px 0 0;">
            <span style="font-family:'Barlow Condensed',Arial,sans-serif;font-weight:700;font-size:15px;color:#F0A500;letter-spacing:0.06em;">
              ${cls.name}
            </span>
            <span style="font-family:Arial,sans-serif;font-size:12px;color:rgba(232,224,216,0.5);margin-left:10px;">
              ${cls.slot} · ${cls.attendanceCount} attended
            </span>
          </td>
        </tr>
        ${
          cls.members.length === 0
            ? `<tr><td style="padding:12px 14px;background:#1A0505;color:rgba(232,224,216,0.4);font-size:13px;border-radius:0 0 6px 6px;">No attendance recorded for this class in the selected period.</td></tr>`
            : cls.members
                .map(
                  (m, i) => `
          <tr style="background:${i % 2 === 0 ? "#1A0505" : "#200808"};">
            <td style="padding:9px 14px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:13px;color:#E8E0D8;">${m.name}</td>
                  <td style="font-family:Arial,sans-serif;font-size:11px;color:rgba(232,224,216,0.3);text-align:right;white-space:nowrap;">
                    ${new Date(m.attended_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
                )
                .join("")
        }
      </table>
    </div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>CLA Discipleship Report</title>
</head>
<body style="margin:0;padding:0;background:#0f0202;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0202;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A0505,#2E0A0A,#4A0A0A);padding:32px 28px;border-radius:12px 12px 0 0;text-align:center;border-bottom:2px solid #D4860A;">
              <p style="margin:0 0 4px;font-family:'Barlow Condensed',Arial,sans-serif;font-size:11px;letter-spacing:0.2em;color:rgba(212,134,10,0.7);text-transform:uppercase;">
                Christian Life Assembly
              </p>
              <h1 style="margin:0 0 6px;font-family:'Barlow Condensed',Arial,sans-serif;font-size:28px;font-weight:800;color:#FFFFFF;letter-spacing:0.04em;">
                Discipleship Report
              </h1>
              <p style="margin:0;font-size:13px;color:rgba(232,224,216,0.55);">
                ${dateFrom} — ${dateTo}
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="background:#1A0505;padding:24px 28px 16px;">
              <p style="margin:0 0 6px;font-size:15px;color:#E8E0D8;">
                Hello <strong style="color:#F0A500;">${facilitatorName}</strong>,
              </p>
              <p style="margin:0;font-size:14px;color:rgba(232,224,216,0.65);line-height:1.6;">
                Here is your discipleship attendance report for the period above.
                This covers only the classes assigned to you.
              </p>
            </td>
          </tr>

          <!-- Summary bar -->
          <tr>
            <td style="background:#1A0505;padding:0 28px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:14px 16px;background:#2E0A0A;border:1px solid rgba(212,134,10,0.2);border-radius:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="text-align:center;border-right:1px solid rgba(212,134,10,0.15);padding-right:12px;">
                          <p style="margin:0;font-family:'Barlow Condensed',Arial,sans-serif;font-size:28px;font-weight:800;color:#F0A500;">${totalAttendance}</p>
                          <p style="margin:2px 0 0;font-size:11px;color:rgba(232,224,216,0.45);letter-spacing:0.05em;text-transform:uppercase;">Total Attended</p>
                        </td>
                        <td style="text-align:center;padding-left:12px;">
                          <p style="margin:0;font-family:'Barlow Condensed',Arial,sans-serif;font-size:28px;font-weight:800;color:#F0A500;">${classes.length}</p>
                          <p style="margin:2px 0 0;font-size:11px;color:rgba(232,224,216,0.45);letter-spacing:0.05em;text-transform:uppercase;">Classes</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Class attendance details -->
          <tr>
            <td style="background:#1A0505;padding:0 28px 8px;">
              <p style="margin:0 0 14px;font-family:'Barlow Condensed',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,134,10,0.7);">
                Attendance Breakdown
              </p>
              ${classRows}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f0202;padding:20px 28px 28px;border-radius:0 0 12px 12px;text-align:center;">
              <p style="margin:0;font-size:12px;color:rgba(232,224,216,0.3);line-height:1.6;">
                This report was generated by the CLA Discipleship Management System.<br />
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
