import nodemailer from "nodemailer";

let _transporter: nodemailer.Transporter | null = null;

export function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   ?? "smtp.gmail.com",
      port:   parseInt(process.env.SMTP_PORT ?? "587"),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

export const FROM_EMAIL =
  process.env.SMTP_FROM ?? `CLA Discipleship <${process.env.SMTP_USER}>`;

function fmtSunday(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function buildReportEmail(data: {
  facilitatorName: string;
  dateFrom: string;
  dateTo: string;
  classes: {
    name: string;
    slot: string;
    attendanceCount: number;
    uniqueMembers: number;
    sundays: string[];
    members: {
      name: string;
      sessions: boolean[];
      attendedCount: number;
      missedCount: number;
      flagged: boolean;
      currentConsecutiveMisses: number;
    }[];
  }[];
  totalAttendance: number;
}): string {
  const { facilitatorName, dateFrom, dateTo, classes, totalAttendance } = data;
  const totalUnique  = classes.reduce((s, c) => s + c.uniqueMembers, 0);
  const totalFlagged = classes.reduce((s, c) => s + c.members.filter((m) => m.flagged).length, 0);

  const classBlocks = classes.map((cls) => {
    const sundays = cls.sundays;
    const headerCells = sundays
      .map((d) => `<th style="padding:5px 6px;text-align:center;font-family:'Barlow Condensed',Arial,sans-serif;font-size:10px;font-weight:700;color:rgba(212,134,10,0.7);letter-spacing:0.05em;white-space:nowrap;min-width:30px;">${fmtSunday(d)}</th>`)
      .join("");

    const memberRows = cls.members.map((m, i) => {
      const bg = m.flagged ? "#2a0808" : i % 2 === 0 ? "#1A0505" : "#1E0808";
      const sessionCells = m.sessions
        .map((attended) =>
          attended
            ? `<td style="padding:5px 6px;text-align:center;color:#C8D400;font-size:13px;">✓</td>`
            : `<td style="padding:5px 6px;text-align:center;color:rgba(255,100,100,0.5);font-size:12px;">✗</td>`
        )
        .join("");
      const flagBadge = m.flagged
        ? `<span style="display:inline-block;margin-left:6px;padding:1px 5px;border-radius:3px;background:rgba(255,80,80,0.2);color:#ff6b6b;font-size:10px;font-weight:700;border:1px solid rgba(255,80,80,0.3);">⚠ ${m.currentConsecutiveMisses} missed</span>`
        : "";
      return `<tr style="background:${bg};">
        <td style="padding:6px 10px;font-family:Arial,sans-serif;font-size:12px;color:#E8E0D8;white-space:nowrap;">${m.name}${flagBadge}</td>
        <td style="padding:5px 8px;text-align:center;font-family:'Barlow Condensed',Arial,sans-serif;font-size:14px;font-weight:700;color:${m.attendedCount === 0 ? "rgba(248,240,230,0.25)" : "var(--cla-amber, #F0A500)"};">${m.attendedCount}</td>
        ${sessionCells}
      </tr>`;
    }).join("");

    return `
    <div style="margin-bottom:32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:10px 14px;background:#2E0A0A;border-left:3px solid #D4860A;border-radius:6px 6px 0 0;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td><span style="font-family:'Barlow Condensed',Arial,sans-serif;font-weight:700;font-size:16px;color:#F0A500;">${cls.name}</span>
                <span style="font-family:Arial,sans-serif;font-size:11px;color:rgba(232,224,216,0.4);margin-left:8px;">${cls.slot.toUpperCase()}</span></td>
              <td style="text-align:right;white-space:nowrap;font-family:Arial,sans-serif;font-size:11px;color:rgba(232,224,216,0.45);">
                ${cls.uniqueMembers} members · ${cls.attendanceCount} sessions
              </td>
            </tr></table>
          </td>
        </tr>
        ${cls.members.length === 0
          ? `<tr><td style="padding:12px 14px;background:#1A0505;color:rgba(232,224,216,0.4);font-size:13px;">No members in this class.</td></tr>`
          : `<tr><td style="background:#221010;padding:0;">
            <div style="overflow-x:auto;">
            <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;min-width:400px;">
              <thead><tr style="background:#2a1010;border-bottom:1px solid rgba(212,134,10,0.2);">
                <th style="padding:6px 10px;text-align:left;font-family:'Barlow Condensed',Arial,sans-serif;font-size:11px;font-weight:700;color:rgba(212,134,10,0.6);letter-spacing:0.08em;">MEMBER</th>
                <th style="padding:6px 8px;text-align:center;font-family:'Barlow Condensed',Arial,sans-serif;font-size:11px;font-weight:700;color:rgba(212,134,10,0.6);letter-spacing:0.08em;min-width:36px;">ATT.</th>
                ${headerCells}
              </tr></thead>
              <tbody>${memberRows}</tbody>
            </table>
            </div>
          </td></tr>`
        }
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>CLA Discipleship Report</title></head>
<body style="margin:0;padding:0;background:#0f0202;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0202;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1A0505,#2E0A0A,#4A0A0A);padding:32px 28px;border-radius:12px 12px 0 0;text-align:center;border-bottom:2px solid #D4860A;">
  <p style="margin:0 0 4px;font-family:'Barlow Condensed',Arial,sans-serif;font-size:11px;letter-spacing:0.2em;color:rgba(212,134,10,0.7);text-transform:uppercase;">Christian Life Assembly</p>
  <h1 style="margin:0 0 6px;font-family:'Barlow Condensed',Arial,sans-serif;font-size:28px;font-weight:800;color:#FFFFFF;">Discipleship Report</h1>
  <p style="margin:0;font-size:13px;color:rgba(232,224,216,0.55);">${dateFrom} — ${dateTo}</p>
</td></tr>

<!-- Greeting -->
<tr><td style="background:#1A0505;padding:24px 28px 16px;">
  <p style="margin:0 0 6px;font-size:15px;color:#E8E0D8;">Hello <strong style="color:#F0A500;">${facilitatorName}</strong>,</p>
  <p style="margin:0;font-size:13px;color:rgba(232,224,216,0.65);line-height:1.6;">Here is your discipleship attendance report. ✓ = attended · ✗ = absent. Members with 3+ consecutive misses are flagged <span style="color:#ff6b6b;">⚠</span>.</p>
</td></tr>

<!-- Summary bar -->
<tr><td style="background:#1A0505;padding:0 28px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="padding:14px 16px;background:#2E0A0A;border:1px solid rgba(212,134,10,0.2);border-radius:8px;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="text-align:center;border-right:1px solid rgba(212,134,10,0.15);padding-right:10px;">
          <p style="margin:0;font-family:'Barlow Condensed',Arial,sans-serif;font-size:26px;font-weight:800;color:#F0A500;">${totalUnique}</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(232,224,216,0.45);text-transform:uppercase;letter-spacing:0.05em;">Members</p>
        </td>
        <td style="text-align:center;border-right:1px solid rgba(212,134,10,0.15);padding:0 10px;">
          <p style="margin:0;font-family:'Barlow Condensed',Arial,sans-serif;font-size:26px;font-weight:800;color:#F0A500;">${totalAttendance}</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(232,224,216,0.45);text-transform:uppercase;letter-spacing:0.05em;">Sessions</p>
        </td>
        <td style="text-align:center;border-right:1px solid rgba(212,134,10,0.15);padding:0 10px;">
          <p style="margin:0;font-family:'Barlow Condensed',Arial,sans-serif;font-size:26px;font-weight:800;color:#F0A500;">${classes.length}</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(232,224,216,0.45);text-transform:uppercase;letter-spacing:0.05em;">Classes</p>
        </td>
        <td style="text-align:center;padding-left:10px;">
          <p style="margin:0;font-family:'Barlow Condensed',Arial,sans-serif;font-size:26px;font-weight:800;color:${totalFlagged > 0 ? "#ff6b6b" : "#F0A500"};">${totalFlagged}</p>
          <p style="margin:2px 0 0;font-size:10px;color:rgba(232,224,216,0.45);text-transform:uppercase;letter-spacing:0.05em;">Flagged</p>
        </td>
      </tr></table>
    </td>
  </tr></table>
</td></tr>

<!-- Class grids -->
<tr><td style="background:#1A0505;padding:0 28px 8px;">
  <p style="margin:0 0 16px;font-family:'Barlow Condensed',Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(212,134,10,0.7);">Attendance Breakdown</p>
  ${classBlocks}
</td></tr>

<!-- Footer -->
<tr><td style="background:#0f0202;padding:20px 28px 28px;border-radius:0 0 12px 12px;text-align:center;">
  <p style="margin:0;font-size:11px;color:rgba(232,224,216,0.3);line-height:1.6;">Generated by the CLA Discipleship Management System. Please do not reply to this email.</p>
</td></tr>

</table></td></tr></table>
</body></html>`;
}
