/**
 * Unified Date utilities for handling Excel serial dates, text dates,
 * MySQL/TiDB database format (YYYY-MM-DD), and UI display format (DD/MM/YYYY).
 */

/**
 * Converts an Excel serial date (e.g. 46054 or 46054.00011574074 or "46054.00011574074")
 * or standard text date ("2026-02-14", "14/02/2026", "14-02-2026", ISO string, etc.)
 * into a valid JavaScript Date object, or null if invalid.
 */
export function excelOrTextToDate(val: any): Date | null {
  if (val === null || val === undefined) return null;

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }

  const str = String(val).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') {
    return null;
  }

  // 1. Check if it's a numeric Excel serial date (number or pure numeric string)
  // e.g., 46054, 46054.00011574074, "46054", "46054.00011574074"
  if (/^\d+(\.\d+)?$/.test(str)) {
    const numVal = parseFloat(str);
    // Excel serial dates range from 1 (Jan 1, 1900) to 100000 (year 2173)
    if (!isNaN(numVal) && isFinite(numVal) && numVal > 1 && numVal < 200000) {
      // Excel epoch starts Dec 30 1899 (accounting for 1900 leap year bug)
      const excelEpochUtc = Date.UTC(1899, 11, 30);
      const msInDay = 86400000;
      const dateMs = excelEpochUtc + Math.round(numVal * msInDay);
      const d = new Date(dateMs);
      if (!isNaN(d.getTime())) {
        return d;
      }
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const dateObj = new Date(Date.UTC(year, month, day));
      if (!isNaN(dateObj.getTime())) return dateObj;
    }
  }

  // 3. DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = parseInt(y, 10);
    const month = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const dateObj = new Date(Date.UTC(year, month, day));
      if (!isNaN(dateObj.getTime())) return dateObj;
    }
  }

  // 4. Try JS Date parser for ISO strings / RFC strings (e.g. "2026-02-02T00:00:00.000Z")
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Normalizes any date value to YYYY-MM-DD string for MySQL/TiDB database storage.
 * Returns empty string if invalid or empty.
 */
export function normalizeDateToYMD(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') {
    return '';
  }

  const d = excelOrTextToDate(val);
  if (!d) return '';

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats any date value to DD/MM/YYYY string for UI display.
 * Returns '-' if empty/null, or 'Invalid Date' if invalid date value.
 */
export function formatDate(val: any): string {
  if (val === null || val === undefined) return '-';
  const str = String(val).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') {
    return '-';
  }

  const d = excelOrTextToDate(val);
  if (d) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${day}/${month}/${year}`;
  }

  return 'Invalid Date';
}
