#!/usr/bin/env node
/**
 * One-time import of Google Forms attendance CSV into Supabase.
 *
 * Usage:
 *   node scripts/import-attendance.js
 *
 * Requires .env.local with:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const fs   = require('fs');
const path = require('path');

// ── Load .env.local ──────────────────────────────────────────────────────────
(function loadEnv() {
  const envFile = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envFile)) { console.error('❌  .env.local not found'); process.exit(1); }
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
})();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Helpers ──────────────────────────────────────────────────────────────────

// Default slot by class number (derived from the standardised data pattern)
function defaultSlot(n) {
  if (n >= 1  && n <= 8)  return '8am';
  if (n >= 9  && n <= 17) return '10am';
  return '12pm'; // 18+
}

function normalizeSlot(s) {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t === '8 am'  || t === '8am')              return '8am';
  if (t === '10 am' || t === '10am')             return '10am';
  if (t === 'midday'|| t === '12pm'|| t === '12 pm') return '12pm';
  return null;
}

// Parse "DD/MM/YYYY HH:MM:SS" → ISO UTC string
function parseTs(raw) {
  const [datePart, timePart] = raw.trim().split(' ');
  const [d, mo, y] = datePart.split('/');
  return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${timePart}+00:00`;
}

// Extract leading class number from "Class 8 - Amos" or "Class 16 -  Dr Nicholas"
function extractClassNum(s) {
  if (!s) return null;
  const m = s.match(/class\s+(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

// Minimal RFC-4180 CSV parser (handles quoted commas)
function parseCSV(text) {
  const rows = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (!line.trim()) continue;
    const fields = [];
    let cur = '', inQ = false;
    for (const c of line) {
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { fields.push(cur); cur = ''; continue; }
      cur += c;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

// Normalise a name for dedup purposes (lowercase, collapse spaces, trim)
function normName(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Fetch all classes (including any beyond 20 if already inserted)
  console.log('📥  Loading classes from Supabase…');
  const { data: classes, error: clsErr } = await supabase
    .from('classes')
    .select('id, name, slot');
  if (clsErr) { console.error(clsErr); process.exit(1); }

  // classLookup[classNumber][slot] = uuid
  const classLookup = {};
  for (const c of classes) {
    const n = extractClassNum(c.name);
    if (!n) continue;
    if (!classLookup[n]) classLookup[n] = {};
    classLookup[n][c.slot] = c.id;
  }
  console.log(`   Found ${classes.length} class-slot rows in DB (classes ${Object.keys(classLookup).sort((a,b)=>a-b).join(', ')})`);

  // 2. Parse CSV
  const csvPath = path.join(
    __dirname, '..',
    '2026 Discipleship class attendance - Cohort 1 (Responses) - Form responses 1.csv'
  );
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
  console.log(`\n📄  CSV rows (incl. header): ${rows.length}`);

  // 3. Process rows
  const seen     = new Set(); // dedup key: normName|classNum|YYYY-MM-DD
  const inserts  = [];
  const warnings = [];        // {row, name, reason}

  for (let i = 1; i < rows.length; i++) {
    // Columns: Timestamp | Name | Class Number | Class Number and Facilitator | Class Time | Column 6
    const [timestamp, rawName, classNumCol, classAndFacil, classTime] = rows[i];

    if (!timestamp || !rawName || !rawName.trim()) continue;
    const name = rawName.trim();

    // ── Determine class number ──────────────────────────────────────────────
    let classNum = null;

    if (classAndFacil && /class\s+\d+/i.test(classAndFacil)) {
      // Format 2 (08/02+): "Class X - Facilitator Name"
      classNum = extractClassNum(classAndFacil);
    } else if (classNumCol && /^\d+$/.test(classNumCol.trim())) {
      // Format 1 (01/02): plain number in column 3
      classNum = parseInt(classNumCol.trim());
    }

    if (!classNum) {
      warnings.push({ row: i + 1, name, reason: 'could not determine class number', raw: classAndFacil || classNumCol });
      continue;
    }

    // ── Determine slot ──────────────────────────────────────────────────────
    const slot = normalizeSlot(classTime) ?? defaultSlot(classNum);

    // ── Parse timestamp ─────────────────────────────────────────────────────
    let attendedAt;
    try { attendedAt = parseTs(timestamp); }
    catch { warnings.push({ row: i + 1, name, reason: 'bad timestamp', raw: timestamp }); continue; }

    // ── Deduplication ───────────────────────────────────────────────────────
    const dateKey  = attendedAt.slice(0, 10);          // YYYY-MM-DD
    const dedupKey = `${normName(name)}|${classNum}|${dateKey}`;
    if (seen.has(dedupKey)) {
      warnings.push({ row: i + 1, name, reason: 'duplicate (same name + class + date)', raw: dedupKey });
      continue;
    }
    seen.add(dedupKey);

    // ── Look up class_id ────────────────────────────────────────────────────
    const classId = classLookup[classNum]?.[slot] ?? null;
    if (!classId) {
      warnings.push({ row: i + 1, name, reason: `Class ${classNum} / ${slot} not in DB — inserting with null class_id`, raw: classAndFacil });
    }

    inserts.push({
      member_name: name,
      class_id:    classId,   // null if class not found — still imported
      service_slot: slot,
      attended_at: attendedAt,
      member_id:   null,      // skipped: too many first-name-only entries to match safely
    });
  }

  // 4. Summary before inserting
  console.log(`\n✅  To import : ${inserts.length} unique records`);
  console.log(`⚠️   Warnings  : ${warnings.length} rows`);

  const byReason = {};
  for (const w of warnings) byReason[w.reason] = (byReason[w.reason] || 0) + 1;
  for (const [reason, count] of Object.entries(byReason)) {
    console.log(`   • ${count}× ${reason}`);
  }

  const nullClass = inserts.filter(r => !r.class_id).length;
  if (nullClass) console.log(`\n   ℹ️  ${nullClass} records have no matching class in DB (class > 20 or missing).`);

  if (inserts.length === 0) { console.log('\nNothing to insert.'); return; }

  // 5. Insert in batches of 500
  console.log('\n⬆️   Inserting…');
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('attendance').insert(batch);
    if (error) {
      console.error(`   ❌  Batch ${i}–${i + batch.length} failed:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`   ${inserted}/${inserts.length}\r`);
    }
  }

  console.log(`\n🎉  Done. ${inserted} attendance records imported successfully.`);
}

main().catch(err => { console.error(err); process.exit(1); });
