/**
 * Unified Date utilities for handling Excel serial dates, text dates,
 * MySQL/TiDB database format (YYYY-MM-DD), and UI display format (DD/MM/YYYY).
 * 
 * STRICT DATE RULES:
 * 1. Preserves the exact date represented in the Excel file.
 * 2. Correctly handles:
 *    - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 *    - Excel serial date numbers (e.g. 45907 -> 07/09/2025)
 *    - JavaScript Date objects without timezone-induced day shifting
 *    - Standard ISO/SQL dates (YYYY-MM-DD)
 * 3. STRICT INDIAN DATE PREFERENCE:
 *    NEVER interpret Indian dates as MM/DD/YYYY.
 *    07/09/2025 MUST remain 07/09/2025 (7th September 2025), NOT 09/07/2025.
 *    01/02/2025 = 1 February 2025, 02/01/2025 = 2 January 2025.
 * 4. NEVER uses `new Date("DD/MM/YYYY")` directly.
 * 5. Database format is always YYYY-MM-DD.
 * 6. Ambiguous or invalid dates are flagged as "Invalid/Ambiguous Date – Please Check".
 */

export interface DateParseOptions {
  preferFormat?: 'DMY' | 'MDY' | 'auto';
  swapDayMonth?: boolean;
}

export interface ParsedDateResult {
  valid: boolean;
  isBlank: boolean;
  ymd: string;            // Database-safe format: YYYY-MM-DD
  parsedYMD?: string;     // Alias for ymd
  display: string;        // Display format: DD/MM/YYYY
  marathiDisplay: string; // Marathi display: e.g. "07/09/2025 (७ सप्टेंबर २०२५)"
  raw: any;               // Original raw value
  day?: number;
  month?: number;
  year?: number;
  error?: string;
}

export const MARATHI_MONTHS = [
  'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर'
];

/**
 * Validates whether year, month, day form a real Gregorian calendar date.
 * Accurately accounts for leap years (Feb 29).
 */
export function isValidDate(year: number, month: number, day: number): boolean {
  if (!year || !month || !day) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Use UTC to avoid any local timezone DST quirks
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * Core strict parser for any Excel date input (text, serial number, Date object).
 * Guarantees zero timezone offset shifting and zero day/month swapping for Indian DD/MM/YYYY dates.
 */
export function parseExcelDateStrict(val: any, options?: DateParseOptions): ParsedDateResult {
  if (val === null || val === undefined) {
    return { valid: false, isBlank: true, ymd: '', display: '-', marathiDisplay: '-', raw: val };
  }

  // 1. JavaScript Date Object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) {
      return {
        valid: false,
        isBlank: false,
        ymd: '',
        display: 'Invalid Date',
        marathiDisplay: 'Invalid/Ambiguous Date – Please Check',
        error: 'Invalid/Ambiguous Date – Please Check',
        raw: val
      };
    }
    // Extract year, month, day without timezone corruption.
    // If constructed with local midnight (e.g., in user's browser in IST), local midnight has hours = 0.
    let year: number;
    let month: number;
    let day: number;

    if (val.getHours() === 0 && val.getMinutes() === 0 && (val.getUTCHours() !== 0 || val.getUTCMinutes() !== 0)) {
      year = val.getFullYear();
      month = val.getMonth() + 1;
      day = val.getDate();
    } else {
      year = val.getUTCFullYear();
      month = val.getUTCMonth() + 1;
      day = val.getUTCDate();
    }

    if (isValidDate(year, month, day)) {
      return buildValidResult(year, month, day, val);
    }
    return {
      valid: false,
      isBlank: false,
      ymd: '',
      display: 'Invalid Date',
      marathiDisplay: 'Invalid/Ambiguous Date – Please Check',
      error: 'Invalid/Ambiguous Date – Please Check',
      raw: val
    };
  }

  // Clean string: strip zero-width characters and non-breaking spaces
  const str = String(val)
    .trim()
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();

  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined' || str === 'NaN') {
    return { valid: false, isBlank: true, ymd: '', display: '-', marathiDisplay: '-', raw: val };
  }

  // 2. Numeric Excel Serial Number (e.g., 45907, 45907.0, "45907", "45907.0001")
  if (/^\d{1,6}(\.\d+)?$/.test(str)) {
    const numVal = parseFloat(str);
    // Standard Excel dates range from 300 (~1900) to 100000 (~2173)
    if (!isNaN(numVal) && isFinite(numVal) && numVal >= 300 && numVal <= 100000) {
      let days = Math.floor(numVal);
      // Lotus 1-2-3 / Excel 1900 leap year bug adjustment:
      // Day 60 is treated as 1900-02-29 in Excel. Days after day 60 must be decremented by 1.
      if (days > 60) days--;
      const ms = (days - 1) * 86400000 + Date.UTC(1900, 0, 1);
      const dObj = new Date(ms);
      const year = dObj.getUTCFullYear();
      const month = dObj.getUTCMonth() + 1;
      const day = dObj.getUTCDate();

      if (isValidDate(year, month, day)) {
        return buildValidResult(year, month, day, val);
      }
    }
  }

  // 3. ISO or Database format: YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD (e.g. "2025-09-07", "2025-08-15T00:00:00.000Z")
  const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return buildValidResult(year, month, day, val);
    }
    return {
      valid: false,
      isBlank: false,
      ymd: '',
      display: 'Invalid Date',
      marathiDisplay: 'Invalid/Ambiguous Date – Please Check',
      error: 'Invalid/Ambiguous Date – Please Check',
      raw: val
    };
  }

  // 4. Indian format: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (e.g. "07/09/2025", "15/08/2025", "01/02/2025", "10-09-2026")
  const dmyMatch = str.match(/^(\d{1,2})[-/.\s](\d{1,2})[-/.\s](\d{2,4})$/);
  if (dmyMatch) {
    const part1 = parseInt(dmyMatch[1], 10);
    const part2 = parseInt(dmyMatch[2], 10);
    let year = parseInt(dmyMatch[3], 10);
    // Expand 2-digit year (e.g. 25 -> 2025, 95 -> 1995)
    if (year < 100) {
      year = year <= 40 ? 2000 + year : 1900 + year;
    }

    let day: number;
    let month: number;

    // Strict Indian Date handling:
    // If Part 2 > 12 and Part 1 <= 12 (e.g. 08/25/2025), Month cannot be 25 so Part 2 is Day.
    if (part2 > 12 && part1 <= 12) {
      day = part2;
      month = part1;
    } else {
      // For all standard Indian dates (DD/MM/YYYY):
      // Even when both part1 <= 12 and part2 <= 12 (e.g. 07/09/2025, 01/02/2025, 02/01/2025, 10-09-2026):
      // Part 1 is strictly DAY and Part 2 is strictly MONTH. NEVER SWAP!
      day = part1;
      month = part2;
    }

    // Explicit manual swap request only if specifically instructed
    if (options?.swapDayMonth && day <= 12 && month <= 12 && day !== month) {
      const temp = day;
      day = month;
      month = temp;
    }

    if (isValidDate(year, month, day)) {
      return buildValidResult(year, month, day, val);
    }

    return {
      valid: false,
      isBlank: false,
      ymd: '',
      display: 'Invalid Date',
      marathiDisplay: 'Invalid/Ambiguous Date – Please Check',
      error: 'Invalid/Ambiguous Date – Please Check',
      raw: val
    };
  }

  // 5. Named Month format: e.g. "10-Sep-2026", "10 September 2026", "Sep 10, 2026"
  const monthNamesMap: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const namedMatch1 = str.match(/^(\d{1,2})[-/\s]([A-Za-z]+)[-/\s](\d{2,4})$/);
  if (namedMatch1) {
    const day = parseInt(namedMatch1[1], 10);
    const monthKey = namedMatch1[2].toLowerCase();
    const month = monthNamesMap[monthKey];
    let year = parseInt(namedMatch1[3], 10);
    if (year < 100) year = year <= 40 ? 2000 + year : 1900 + year;
    if (month && isValidDate(year, month, day)) {
      return buildValidResult(year, month, day, val);
    }
  }

  const namedMatch2 = str.match(/^([A-Za-z]+)[-/\s](\d{1,2}),?[-/\s](\d{2,4})$/);
  if (namedMatch2) {
    const monthKey = namedMatch2[1].toLowerCase();
    const month = monthNamesMap[monthKey];
    const day = parseInt(namedMatch2[2], 10);
    let year = parseInt(namedMatch2[3], 10);
    if (year < 100) year = year <= 40 ? 2000 + year : 1900 + year;
    if (month && isValidDate(year, month, day)) {
      return buildValidResult(year, month, day, val);
    }
  }

  // 6. Unrecognized or Ambiguous format -> Do NOT guess!
  return {
    valid: false,
    isBlank: false,
    ymd: '',
    display: 'Invalid Date',
    marathiDisplay: 'Invalid/Ambiguous Date – Please Check',
    error: 'Invalid/Ambiguous Date – Please Check',
    raw: val
  };
}

function buildValidResult(year: number, month: number, day: number, raw: any): ParsedDateResult {
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const rawStr = typeof raw === 'string' ? raw.trim() : '';
  const sep = rawStr.includes('-') && !rawStr.includes('/') ? '-' : '/';
  const display = `${String(day).padStart(2, '0')}${sep}${String(month).padStart(2, '0')}${sep}${year}`;
  const monthName = MARATHI_MONTHS[month - 1] || '';
  const marathiDisplay = `${display} (${day} ${monthName} ${year})`;
  return {
    valid: true,
    isBlank: false,
    ymd,
    parsedYMD: ymd,
    display,
    marathiDisplay,
    raw,
    day,
    month,
    year
  };
}

/**
 * Normalizes any date value to YYYY-MM-DD string for MySQL/TiDB database storage.
 * Returns empty string if invalid or empty.
 */
export function normalizeDateToYMD(val: any, options?: DateParseOptions): string {
  const res = parseExcelDateStrict(val, options);
  return res.valid ? res.ymd : '';
}

/**
 * Formats any date value to DD/MM/YYYY string for UI display.
 * Returns '-' if empty/null, or 'Invalid Date' if invalid date value.
 */
export function formatDate(val: any, options?: DateParseOptions): string {
  const res = parseExcelDateStrict(val, options);
  if (res.valid) return res.display;
  if (res.isBlank) return '-';
  return 'Invalid Date';
}

/**
 * Formats any date with Marathi month name for crystal clear verification.
 * e.g. "07/09/2025 (७ सप्टेंबर २०२५)"
 */
export function formatDateWithMarathi(val: any, options?: DateParseOptions): string {
  const res = parseExcelDateStrict(val, options);
  if (res.valid) return res.marathiDisplay;
  if (res.isBlank) return '-';
  return res.error || 'Invalid/Ambiguous Date – Please Check';
}

/**
 * Converts an Excel serial date or standard text date into a UTC Date object.
 * Returns null if invalid or blank.
 */
export function excelOrTextToDate(val: any, options?: DateParseOptions): Date | null {
  const res = parseExcelDateStrict(val, options);
  if (!res.valid || !res.year || !res.month || !res.day) return null;
  return new Date(Date.UTC(res.year, res.month - 1, res.day, 0, 0, 0));
}

/**
 * Returns true if a date string is invalid or ambiguous and requires user checking.
 */
export function isInvalidOrAmbiguousDate(val: any): boolean {
  if (val === null || val === undefined) return false;
  const str = String(val).trim();
  if (!str || str === '-' || str === 'N/A' || str === 'null' || str === 'undefined') return false;
  const res = parseExcelDateStrict(val);
  return !res.valid;
}

/**
 * Checks if a date has day <= 12 and month <= 12 and day !== month,
 * meaning it is structurally eligible for swapping if an operator specifically needs to.
 */
export function canSwapDateMonth(val: any): boolean {
  if (!val) return false;
  const res = parseExcelDateStrict(val);
  if (!res.valid || !res.day || !res.month) return false;
  return res.day <= 12 && res.month <= 12 && res.day !== res.month;
}

/**
 * Safely swaps day and month for any date (e.g. YYYY-MM-DD or DD/MM/YYYY).
 */
export function swapDateAndMonth(val: any): string {
  if (!val) return '';
  const res = parseExcelDateStrict(val);
  if (!res.valid || !res.day || !res.month || !res.year) return '';

  if (res.day <= 12 && res.month <= 12) {
    const newMonth = String(res.day).padStart(2, '0');
    const newDay = String(res.month).padStart(2, '0');
    return `${res.year}-${newMonth}-${newDay}`;
  }

  return res.ymd;
}
