import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';


export default function AdminImportPanel({ onImportComplete }) {
  const [status, setStatus] = useState('idle'); // idle | fetching | importing | done | error
  const [progress, setProgress] = useState({ total: 0, imported: 0, skipped: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [resumeOffset, setResumeOffset] = useState(0);

  const parseCSVLine = (line) => {
    // Handles quoted fields with commas inside
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
  };

  const parseCSV = (text) => {
    const lines = text.split('\n');
    const headers = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
    const courses = [];
    const seen = new Set();

    // Helper: find first matching header value (case-insensitive)
    const get = (row, ...keys) => {
      for (const key of keys) {
        const match = headers.find(h => h.toLowerCase() === key.toLowerCase());
        if (match && row[match] !== undefined) return row[match] || '';
      }
      return '';
    };

    const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      const row = {};
      headers.forEach((h, idx) => { row[h] = (cols[idx] || '').replace(/^"|"$/g, '').trim(); });

      const name = get(row, 'CourseName', 'course_name', 'name', 'Course');
      const city = get(row, 'City', 'city');
      const state = get(row, 'Region', 'State', 'state');

      if (!name || name === 'NOMATCH' || name.length < 2) continue;
      if (!state || state.length !== 2) continue;

      const key = `${name}__${city}__${state}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Build tee sets from CSV columns if slope/rating present
      const teeSets = [];

      // Support up to 5 tee sets via columns: tee1_name, tee1_slope, tee1_rating, tee1_ladies_slope, tee1_ladies_rating
      for (let t = 1; t <= 5; t++) {
        const teeName = get(row, `tee${t}_name`, `tee${t}Name`);
        const slope = toNum(get(row, `tee${t}_slope`, `tee${t}Slope`));
        const rating = toNum(get(row, `tee${t}_rating`, `tee${t}Rating`));
        const ladiesSlope = toNum(get(row, `tee${t}_ladies_slope`, `tee${t}LadiesSlope`));
        const ladiesRating = toNum(get(row, `tee${t}_ladies_rating`, `tee${t}LadiesRating`));
        if (teeName || slope || rating) {
          const ts = { name: teeName || `Tee ${t}` };
          if (slope) ts.slope = slope;
          if (rating) ts.rating = rating;
          if (ladiesSlope) ts.ladies_slope = ladiesSlope;
          if (ladiesRating) ts.ladies_rating = ladiesRating;
          teeSets.push(ts);
        }
      }

      // Also support simple single-tee columns: tee_name, slope, rating, ladies_slope, ladies_rating
      const simpleName = get(row, 'tee_name', 'TeeName', 'tee');
      const simpleSlope = toNum(get(row, 'slope', 'Slope', 'men_slope'));
      const simpleRating = toNum(get(row, 'rating', 'Rating', 'men_rating', 'course_rating'));
      const simpleLadiesSlope = toNum(get(row, 'ladies_slope', 'LadiesSlope', 'womens_slope'));
      const simpleLadiesRating = toNum(get(row, 'ladies_rating', 'LadiesRating', 'womens_rating'));
      if (teeSets.length === 0 && (simpleSlope || simpleRating)) {
        const ts = { name: simpleName || 'White' };
        if (simpleSlope) ts.slope = simpleSlope;
        if (simpleRating) ts.rating = simpleRating;
        if (simpleLadiesSlope) ts.ladies_slope = simpleLadiesSlope;
        if (simpleLadiesRating) ts.ladies_rating = simpleLadiesRating;
        teeSets.push(ts);
      }

      const course = { name, city, state };
      if (teeSets.length > 0) course.tee_sets = teeSets;

      courses.push(course);
    }

    return courses;
  };

  const downloadTemplate = () => {
    const header = 'name,city,state,tee1_name,tee1_slope,tee1_rating,tee1_ladies_slope,tee1_ladies_rating,tee2_name,tee2_slope,tee2_rating,tee3_name,tee3_slope,tee3_rating';
    const example = 'Pebble Beach Golf Links,Pebble Beach,CA,Blue,143,75.5,138,74.0,White,131,73.8,Red,121,70.2,';
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'course_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (startOffset = 0) => {
    setStatus('fetching');
    setErrorMsg('');
    try {
      let offset = startOffset;
      const pageSize = 500;
      let totalImported = startOffset > 0 ? progress.imported : 0;
      let totalSkipped = startOffset > 0 ? progress.skipped : 0;
      let totalAvailable = progress.total || 0;
      let done = false;

      while (!done) {
        let data = {};
        try {
          const res = await base44.functions.invoke('importCourses', {
            fetch_from_web: true,
            replace_all: replaceAll && offset === 0,
            offset,
            page_size: pageSize,
          });
          data = res.data || {};
        } catch (batchErr) {
          // Single batch failed — log it, save resume point, and stop
          console.error(`Batch at offset ${offset} failed:`, batchErr.message);
          setResumeOffset(offset);
          setStatus('error');
          setErrorMsg(`Batch at offset ${offset} failed: ${batchErr.message}. Click "Resume" to continue from here.`);
          return;
        }

        totalImported += data.created || 0;
        totalSkipped += data.skipped || 0;
        totalAvailable = data.total_available || totalAvailable;
        done = data.done ?? true;
        offset += pageSize;

        setStatus('importing');
        setProgress({
          total: totalAvailable,
          imported: totalImported,
          skipped: totalSkipped,
          processed: Math.min(offset, totalAvailable),
        });
      }

      setResumeOffset(0);
      setStatus('done');
      setProgress({ total: totalAvailable, imported: totalImported, skipped: totalSkipped });
      toast.success(`Imported ${totalImported.toLocaleString()} courses!`);
      onImportComplete?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg(`Import failed: ${err.message}`);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('importing');
    setErrorMsg('');

    try {
      const text = await file.text();
      const courses = parseCSV(text);

      if (courses.length === 0) {
        setStatus('error');
        setErrorMsg('No valid courses found in the file.');
        return;
      }

      setProgress({ total: courses.length, imported: 0 });

      const chunkSize = 500;
      let totalImported = 0;
      let isFirst = true;

      for (let i = 0; i < courses.length; i += chunkSize) {
        const chunk = courses.slice(i, i + chunkSize);
        const res = await base44.functions.invoke('importCourses', {
          courses: chunk,
          replace_all: isFirst && replaceAll,
        });
        totalImported += res.data?.created || 0;
        setProgress({ total: courses.length, imported: Math.min(i + chunkSize, courses.length) });
        isFirst = false;
      }

      setStatus('done');
      setProgress({ total: courses.length, imported: totalImported });
      toast.success(`Imported ${totalImported.toLocaleString()} courses!`);
      onImportComplete?.();
    } catch (err) {
      setStatus('error');
      setErrorMsg(`Import failed: ${err.message}`);
    }
  };

  const isRunning = status === 'fetching' || status === 'importing';

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Download className="w-4 h-4 text-primary" /> Import US Course Database
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Auto-import from a free public dataset, or upload your own CSV with slope/rating data included.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="replace-all"
          checked={replaceAll}
          onChange={e => setReplaceAll(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <label htmlFor="replace-all" className="text-sm text-foreground">
          Replace existing admin-managed courses (fresh import)
        </label>
      </div>

      {status === 'done' && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm font-medium">
            Imported {progress.imported.toLocaleString()} of {progress.total.toLocaleString()} courses
            {progress.skipped > 0 && ` — skipped ${progress.skipped} bad rows`}.
          </span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="text-sm">{errorMsg}</span>
        </div>
      )}

      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {status === 'fetching'
              ? 'Connecting to dataset...'
              : `Imported ${progress.imported.toLocaleString()} of ${progress.total.toLocaleString()}${progress.skipped > 0 ? ` — skipped ${progress.skipped} bad rows` : ''}`}
          </div>
          {progress.total > 0 && (
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${Math.round(((progress.processed || progress.imported) / progress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => handleImport(0)} disabled={isRunning} className="gap-2">
          {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Auto-Import from Web
        </Button>
        {status === 'error' && resumeOffset > 0 && (
          <Button onClick={() => handleImport(resumeOffset)} variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Resume from #{resumeOffset.toLocaleString()}
          </Button>
        )}

        <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-md border-2 border-border bg-card text-foreground text-sm font-medium cursor-pointer hover:bg-muted transition-colors ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}>
          <Upload className="w-4 h-4" />
          Upload CSV File
          <input
            type="file"
            accept=".csv"
            className="hidden"
            disabled={isRunning}
            onChange={handleFileUpload}
          />
        </label>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p><strong>CSV columns supported:</strong> <code>name, city, state, tee1_name, tee1_slope, tee1_rating, tee1_ladies_slope, tee1_ladies_rating</code> (up to 5 tees).</p>
        <p>Also accepts simple single-tee: <code>slope, rating, ladies_slope, ladies_rating</code>.</p>
        <button onClick={downloadTemplate} className="text-primary underline hover:no-underline">Download template CSV</button>
      </div>
    </div>
  );
}