import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Imports courses. Two modes:
// 1. fetch_from_web: true — downloads the GitHub dataset server-side and imports it
// 2. courses: [{name, city, state, tee_sets?}] — import a provided batch
// Payload: { fetch_from_web?, courses?, replace_all?, offset?, page_size? }

const DATASET_URL = 'https://raw.githubusercontent.com/seanconeys/US_Golf_Courses/master/golf_courses.csv';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const courses = [];
  const seen = new Set();

  const get = (row, ...keys) => {
    for (const key of keys) {
      const match = headers.find(h => h.toLowerCase() === key.toLowerCase());
      if (match && row[match] !== undefined) return row[match] || '';
    }
    return '';
  };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });

    const name = get(row, 'Name', 'CourseName', 'course_name', 'name', 'Course');
    const city = get(row, 'City', 'city');
    const state = get(row, 'State', 'Region', 'state');

    if (!name || name === 'NOMATCH' || name.length < 2) continue;
    if (!state || state.length !== 2) continue;

    const key = `${name}__${city}__${state}`;
    if (seen.has(key)) continue;
    seen.add(key);

    courses.push({ name, city, state });
  }
  return courses;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const { fetch_from_web = false, replace_all = false, offset = 0, page_size = 500 } = body;
  let courses = body.courses || [];

  if (fetch_from_web) {
    const res = await fetch(DATASET_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return Response.json({ error: `Dataset download failed: HTTP ${res.status}` }, { status: 502 });
    }
    const csvText = await res.text();
    const all = parseCSV(csvText);
    if (all.length === 0) {
      return Response.json({ error: 'No valid courses parsed from dataset' }, { status: 422 });
    }

    const total_available = all.length;
    courses = all.slice(offset, offset + page_size);

    if (courses.length === 0) {
      return Response.json({ success: true, created: 0, skipped: 0, errors: [], total_available, done: true });
    }

    // Replace existing admin courses only on first page
    if (replace_all && offset === 0) {
      const existing = await base44.asServiceRole.entities.Course.filter({ is_admin_managed: true });
      for (const c of existing) {
        await base44.asServiceRole.entities.Course.delete(c.id);
      }
    }

    // Insert one-by-one inside chunks so a bad row doesn't kill the whole batch
    const chunkSize = 50;
    let created = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < courses.length; i += chunkSize) {
      const chunk = courses.slice(i, i + chunkSize);

      // Try bulk first for speed; fall back to individual inserts if bulk fails
      try {
        const records = chunk.map(c => ({
          name: c.name, city: c.city || '', state: c.state || '',
          is_admin_managed: true, is_private: false, tee_sets: c.tee_sets || [],
        }));
        const results = await base44.asServiceRole.entities.Course.bulkCreate(records);
        created += results.length;
      } catch (bulkErr) {
        console.log(`[WARN] Bulk insert failed for chunk ${i}-${i + chunkSize}, falling back to individual inserts. Error: ${bulkErr.message}`);
        // Fall back: insert one by one
        for (let j = 0; j < chunk.length; j++) {
          const c = chunk[j];
          try {
            await base44.asServiceRole.entities.Course.create({
              name: c.name, city: c.city || '', state: c.state || '',
              is_admin_managed: true, is_private: false, tee_sets: c.tee_sets || [],
            });
            created++;
          } catch (rowErr) {
            skipped++;
            const rowIndex = offset + i + j + 1;
            const msg = `Row ${rowIndex} (${c.name}, ${c.state}): ${rowErr.message}`;
            errors.push(msg);
            console.log(`[SKIP] ${msg}`);
          }
        }
      }
    }

    return Response.json({
      success: true,
      created,
      skipped,
      errors: errors.slice(0, 20), // cap to avoid huge payloads
      offset,
      next_offset: offset + page_size,
      total_available,
      done: offset + page_size >= total_available,
    });
  }

  // ── Manual batch upload path ──────────────────────────────────────────────
  if (!Array.isArray(courses) || courses.length === 0) {
    return Response.json({ error: 'No courses provided' }, { status: 400 });
  }

  if (replace_all) {
    const existing = await base44.asServiceRole.entities.Course.filter({ is_admin_managed: true });
    for (const c of existing) {
      await base44.asServiceRole.entities.Course.delete(c.id);
    }
  }

  const chunkSize = 50;
  let created = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < courses.length; i += chunkSize) {
    const chunk = courses.slice(i, i + chunkSize);
    try {
      const records = chunk.map(c => ({
        name: c.name, city: c.city || '', state: c.state || '',
        is_admin_managed: true, is_private: false, tee_sets: c.tee_sets || [],
      }));
      const results = await base44.asServiceRole.entities.Course.bulkCreate(records);
      created += results.length;
    } catch (bulkErr) {
      for (let j = 0; j < chunk.length; j++) {
        const c = chunk[j];
        try {
          await base44.asServiceRole.entities.Course.create({
            name: c.name, city: c.city || '', state: c.state || '',
            is_admin_managed: true, is_private: false, tee_sets: c.tee_sets || [],
          });
          created++;
        } catch (rowErr) {
          skipped++;
          errors.push(`Row ${i + j + 1} (${c.name}): ${rowErr.message}`);
        }
      }
    }
  }

  return Response.json({ success: true, created, skipped, errors: errors.slice(0, 20), total: courses.length });
});