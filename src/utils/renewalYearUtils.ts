import { excelOrTextToDate } from './dateUtils.js';

/**
 * Normalizes a renewal year string to standard format "YYYY-YY" (e.g. "2025-26").
 * Handles:
 * - "2025-26" -> "2025-26"
 * - "2025-2026" -> "2025-26"
 * - "2025" -> "2025-26"
 */
export function normalizeRenewalYear(val?: string | number | null): string {
  if (!val) return '';
  const str = String(val).trim();
  if (!str) return '';

  // Match standard YYYY-YY or YYYY-YYYY
  const mRange = str.match(/^(\d{4})\s*[-/]\s*(\d{2,4})$/);
  if (mRange) {
    const startYear = parseInt(mRange[1], 10);
    const endShort = String((startYear + 1) % 100).padStart(2, '0');
    return `${startYear}-${endShort}`;
  }

  // Match single 4-digit year e.g. "2025"
  const mSingle = str.match(/^(\d{4})$/);
  if (mSingle) {
    const startYear = parseInt(mSingle[1], 10);
    const endShort = String((startYear + 1) % 100).padStart(2, '0');
    return `${startYear}-${endShort}`;
  }

  return str;
}

/**
 * Extracts the start year number (e.g. 2025 from "2025-26").
 */
export function getStartYear(yearStr?: string | null): number {
  if (!yearStr) return 0;
  const normalized = normalizeRenewalYear(yearStr);
  const match = normalized.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Derives the financial year (April 1 to March 31) from a date.
 * If month >= 4 (April to December), FY is YYYY-(YY+1).
 * If month < 4 (January to March), FY is (YYYY-1)-YY.
 * Example:
 * - 2026-09-05 -> "2026-27"
 * - 2026-01-15 -> "2025-26"
 */
export function getFinancialYearFromDate(dateVal?: any): string {
  const d = excelOrTextToDate(dateVal);
  const targetDate = d || new Date();

  const y = targetDate.getUTCFullYear();
  const m = targetDate.getUTCMonth() + 1; // 1 to 12

  const startYear = m >= 4 ? y : y - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
}

/**
 * Calculates the next eligible renewal year.
 * Example:
 * - "2025-26" -> "2026-27"
 * - "2026-27" -> "2027-28"
 * If no previous year, returns the current financial year.
 */
export function getNextRenewalYear(lastYearStr?: string | null): string {
  if (!lastYearStr) {
    return getFinancialYearFromDate(new Date());
  }
  const start = getStartYear(lastYearStr);
  if (start > 0) {
    const nextStart = start + 1;
    const nextEndShort = String((nextStart + 1) % 100).padStart(2, '0');
    return `${nextStart}-${nextEndShort}`;
  }
  return getFinancialYearFromDate(new Date());
}

/**
 * Compares two renewal years for sorting newest first.
 * Returns negative if a > b (so a comes first), positive if a < b.
 */
export function compareRenewalYearsDesc(a?: string | null, b?: string | null): number {
  const yearA = getStartYear(a);
  const yearB = getStartYear(b);
  if (yearA !== yearB) {
    return yearB - yearA; // Higher year first
  }
  return 0;
}
