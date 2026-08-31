#!/usr/bin/env node
/**
 * Safely imports the Cohort 2026B Google Form attendance file.
 * Preview first: node scripts/import-cohort-2026b-attendance.js
 * Commit only after reviewing: node scripts/import-cohort-2026b-attendance.js --commit
 */
const fs = require("fs");
const path = require("path");

for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
  if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
}
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const csvFile = path.join(__dirname, "..", "Discipleship Cohort 2026B – Student  Attendance .csv");
const committing = process.argv.includes("--commit");

function parseCSV(text) {
  const result = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") i++; row.push(field); if (row.some((v) => v.trim())) result.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field); if (row.some((v) => v.trim())) result.push(row); return result;
}
function normalName(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function tokenName(value) { return normalName(value).split(" ").sort().join(" "); }
function className(number) { return `Class ${String(number).padStart(2, "0")}`; }
function timestampToISO(value) { return new Date(value.replace(/^([0-9]{4})\/([0-9]{2})\/([0-9]{2})/, "$1-$2-$3").replace(" GMT+3", "+03:00")).toISOString(); }

async function main() {
  const [{ data: classes, error: classesError }, { data: members, error: membersError }, { data: attendance, error: attendanceError }] = await Promise.all([
    supabase.from("classes").select("id,name,slot").eq("is_active", true),
    supabase.from("members").select("id,first_name,last_name,other_name,class_id"),
    supabase.from("attendance").select("member_id,attended_at").gte("attended_at", "2026-08-30T00:00:00.000Z").lte("attended_at", "2026-08-30T23:59:59.999Z"),
  ]);
  if (classesError || membersError || attendanceError) throw new Error(classesError?.message || membersError?.message || attendanceError?.message);
  const classByName = new Map(classes.map((c) => [c.name, c]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const existing = new Set((attendance ?? []).filter((r) => r.member_id).map((r) => `${r.member_id}|${r.attended_at.slice(0, 10)}`));
  const seen = new Set(), inserts = [], skipped = [];
  const rows = parseCSV(fs.readFileSync(csvFile, "utf8")).slice(1);
  for (const [index, row] of rows.entries()) {
    const [timestamp, rawName, rawClass] = row;
    const classNumber = Number(rawClass?.trim()); const submittedClass = classByName.get(className(classNumber));
    const normalized = normalName(rawName || ""); const tokenized = tokenName(rawName || "");
    const nameMatches = members.filter((m) => normalName([m.first_name, m.other_name, m.last_name].filter(Boolean).join(" ")) === normalized || tokenName([m.first_name, m.other_name, m.last_name].filter(Boolean).join(" ")) === tokenized);
    const classMatches = nameMatches.filter((m) => m.class_id === submittedClass?.id);
    const member = classMatches.length === 1 ? classMatches[0] : nameMatches.length === 1 ? nameMatches[0] : null;
    const cls = member ? classById.get(member.class_id) : null;
    if (!timestamp || !rawName || !submittedClass || !member || !cls) { skipped.push({ row: index + 2, name: rawName, reason: !submittedClass ? "class not found" : nameMatches.length === 0 ? "no matching member" : "ambiguous member match" }); continue; }
    const attendedAt = timestampToISO(timestamp), date = attendedAt.slice(0, 10), key = `${member.id}|${date}`;
    if (seen.has(key) || existing.has(key)) { skipped.push({ row: index + 2, name: rawName, reason: "duplicate or already imported" }); continue; }
    seen.add(key);
    inserts.push({ member_id: member.id, member_name: [member.first_name, member.other_name, member.last_name].filter(Boolean).join(" "), class_id: cls.id, service_slot: cls.slot, attended_at: attendedAt });
  }
  console.log(`Rows: ${rows.length}; ready: ${inserts.length}; skipped: ${skipped.length}`);
  if (skipped.length) console.table(skipped);
  if (!committing) { console.log("Dry run only. Re-run with --commit after reviewing this report."); return; }
  if (inserts.length) { const { error } = await supabase.from("attendance").insert(inserts); if (error) throw error; }
  console.log(`Imported ${inserts.length} attendance record(s).`);
}
main().catch((error) => { console.error(error.message); process.exit(1); });
