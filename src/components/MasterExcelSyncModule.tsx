import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Database,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Building2,
  Hash,
  MapPin,
  Check,
  X,
  FileCheck,
  Filter,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { User, WorkerRegistration, WorkerRenewal } from '../types';

interface MasterExcelSyncModuleProps {
  currentUser: User;
  registrations: WorkerRegistration[];
  renewals?: WorkerRenewal[];
  onRefreshRegistrations: () => void;
  onRefreshRenewals?: () => void;
}

export interface MasterExcelRecord {
  workerName: string;
  mhNumber: string;
  village?: string;
  taluka?: string;
  district?: string;
  mobileNumber?: string;
  aadhaarNumber?: string;
  registrationDate?: string;
  rawRow?: any;
}

export interface TargetRecord {
  id: string;
  type: 'registration' | 'renewal';
  workerName: string;
  mhNumber?: string;
  village?: string;
  taluka?: string;
  mobileNumber?: string;
  aadhaarNumber?: string;
  status: string;
  date?: string;
}

export interface MultipleMatchItem {
  target: TargetRecord;
  candidates: MasterExcelRecord[];
  matchReason?: 'only_mobile_match' | 'multiple_name_candidates' | 'partial_name_match';
  matchedMobile?: string;
}

export interface SyncStats {
  totalChecked: number;
  totalMatched: number;
  totalPending: number;
  totalMultipleMatches: number;
  totalOnlyMobileMatches: number;
}

// Clean and extract standard 10-digit mobile number
export function cleanMobile(num?: string | number): string {
  if (!num) return '';
  const digits = String(num).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

// Helper to normalize names for smart matching
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\b(mr|mrs|ms|shri|shrimati|smt|kumari|kumar|dr|late)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fuzzy matching for name tokens (supports minor Marathi/English spelling variants like dattatray vs dattatraya)
export function tokensFuzzyMatch(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  if (t1.length >= 4 && t2.length >= 4) {
    if (t1.startsWith(t2) || t2.startsWith(t1)) {
      return Math.abs(t1.length - t2.length) <= 2;
    }
  }
  return false;
}

export interface NameComparisonResult {
  isFullMatch: boolean; // First, Middle, and Last name all match
  isPartialMatch: boolean; // At least 2 tokens match
  matchedTokensCount: number;
  totalTokensA: number;
  totalTokensB: number;
}

// Compare First, Middle, and Last names between two worker records
export function compareWorkerNames(name1: string, name2: string): NameComparisonResult {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  if (!norm1 || !norm2) {
    return { isFullMatch: false, isPartialMatch: false, matchedTokensCount: 0, totalTokensA: 0, totalTokensB: 0 };
  }

  const tokens1 = norm1.split(' ').filter((t) => t.length > 1);
  const tokens2 = norm2.split(' ').filter((t) => t.length > 1);

  if (tokens1.length === 0 || tokens2.length === 0) {
    return { isFullMatch: false, isPartialMatch: false, matchedTokensCount: 0, totalTokensA: 0, totalTokensB: 0 };
  }

  let matchedCount = 0;
  const usedIndices = new Set<number>();

  for (const t1 of tokens1) {
    for (let j = 0; j < tokens2.length; j++) {
      if (!usedIndices.has(j) && tokensFuzzyMatch(t1, tokens2[j])) {
        usedIndices.add(j);
        matchedCount++;
        break;
      }
    }
  }

  // First, Middle, Last Name Match:
  // If both have 3 or more parts, at least 3 parts must match (First + Middle + Last)
  // If both have 2 parts, both 2 parts must match (First + Last)
  const isFullMatch =
    (tokens1.length >= 3 && tokens2.length >= 3 && matchedCount >= 3) ||
    (tokens1.length === 2 && tokens2.length === 2 && matchedCount >= 2) ||
    (matchedCount === tokens1.length && matchedCount === tokens2.length && matchedCount >= 2);

  const isPartialMatch = matchedCount >= 2;

  return {
    isFullMatch,
    isPartialMatch,
    matchedTokensCount: matchedCount,
    totalTokensA: tokens1.length,
    totalTokensB: tokens2.length,
  };
}

// Token set matching (handles name order variations e.g. "Patil Ramesh" vs "Ramesh Patil")
export function isNameMatch(name1: string, name2: string): boolean {
  const res = compareWorkerNames(name1, name2);
  return res.isFullMatch || res.isPartialMatch;
}

export const MasterExcelSyncModule: React.FC<MasterExcelSyncModuleProps> = ({
  currentUser,
  registrations,
  renewals = [],
  onRefreshRegistrations,
  onRefreshRenewals,
}) => {
  const [excelData, setExcelData] = useState<MasterExcelRecord[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [syncDone, setSyncDone] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [stats, setStats] = useState<SyncStats>({
    totalChecked: 0,
    totalMatched: 0,
    totalPending: 0,
    totalMultipleMatches: 0,
    totalOnlyMobileMatches: 0,
  });

  const [autoMatchedList, setAutoMatchedList] = useState<
    { target: TargetRecord; excel: MasterExcelRecord; matchType?: string }[]
  >([]);
  const [multipleMatchesList, setMultipleMatchesList] = useState<MultipleMatchItem[]>([]);
  const [pendingList, setPendingList] = useState<TargetRecord[]>([]);

  const [activeTab, setActiveTab] = useState<'multiple' | 'matched' | 'pending'>('multiple');
  const [manualFilter, setManualFilter] = useState<'all' | 'only_mobile' | 'multi_name'>('all');
  const [selectedResolution, setSelectedResolution] = useState<MultipleMatchItem | null>(null);
  const [isUpdatingSingle, setIsUpdatingSingle] = useState<boolean>(false);

  // Parse Excel / CSV file smoothly without freezing the UI
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setFileName(file.name);
    setSyncDone(false);
    setIsParsing(true);
    setProcessingStatus('Reading Excel file...');

    // Yield to browser to render loading UI state
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const buffer = await file.arrayBuffer();
      setProcessingStatus('Parsing sheet data...');
      await new Promise((resolve) => setTimeout(resolve, 20));

      const wb = XLSX.read(buffer, { type: 'array', dense: true });
      const wsName = wb.SheetNames[0];
      const ws = wb.Sheets[wsName];

      const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rawJson || rawJson.length === 0) {
        setErrorMsg('The selected Excel file appears to be empty.');
        setIsParsing(false);
        return;
      }

      setProcessingStatus(`Processing ${rawJson.length} rows...`);
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Detect column mappings ONCE from first row keys
      const firstRow = rawJson[0] || {};
      const keys = Object.keys(firstRow);

      let nameKey = '';
      let firstNameKey = '';
      let middleNameKey = '';
      let lastNameKey = '';
      let mhKey = '';
      let villageKey = '';
      let talukaKey = '';
      let districtKey = '';
      let mobileKey = '';
      let aadhaarKey = '';
      let regDateKey = '';

      for (const key of keys) {
        const kLower = key.toLowerCase().trim();
        if (
          !firstNameKey &&
          (kLower.includes('first name') ||
            kLower.includes('firstname') ||
            kLower.includes('पहिले नाव') ||
            kLower.includes('प्रथम नाव'))
        ) {
          firstNameKey = key;
        } else if (
          !middleNameKey &&
          (kLower.includes('middle name') ||
            kLower.includes('middlename') ||
            kLower.includes('father') ||
            kLower.includes('husband') ||
            kLower.includes('वडिलांचे') ||
            kLower.includes('पतीचे') ||
            kLower.includes('मधले नाव'))
        ) {
          middleNameKey = key;
        } else if (
          !lastNameKey &&
          (kLower.includes('last name') ||
            kLower.includes('lastname') ||
            kLower.includes('surname') ||
            kLower.includes('आडनाव') ||
            kLower.includes('उपनाम'))
        ) {
          lastNameKey = key;
        } else if (
          !nameKey &&
          (kLower.includes('worker') ||
            kLower.includes('applicant') ||
            kLower.includes('kamgar') ||
            kLower.includes('full name') ||
            kLower.includes('name') ||
            kLower.includes('नाव') ||
            kLower.includes('नांव'))
        ) {
          nameKey = key;
        } else if (
          !mhKey &&
          (kLower.includes('mh') ||
            kLower.includes('registration') ||
            kLower.includes('bocw') ||
            kLower.includes('नोंदणी क्रमांक') ||
            kLower.includes('reg no'))
        ) {
          mhKey = key;
        } else if (!villageKey && (kLower.includes('village') || kLower.includes('गाव') || kLower.includes('gram'))) {
          villageKey = key;
        } else if (!talukaKey && (kLower.includes('taluka') || kLower.includes('तालुका'))) {
          talukaKey = key;
        } else if (!districtKey && (kLower.includes('district') || kLower.includes('जिल्हा'))) {
          districtKey = key;
        } else if (
          !mobileKey &&
          (kLower.includes('mobile') ||
            kLower.includes('phone') ||
            kLower.includes('contact') ||
            kLower.includes('cell') ||
            kLower.includes('मोबाईल') ||
            kLower.includes('फोन') ||
            kLower.includes('संपर्क') ||
            kLower.includes('भ्रमणध्वनी'))
        ) {
          mobileKey = key;
        } else if (!aadhaarKey && (kLower.includes('aadhaar') || kLower.includes('adhar') || kLower.includes('आधार'))) {
          aadhaarKey = key;
        } else if (!regDateKey && (kLower.includes('date') || kLower.includes('तारीख') || kLower.includes('दिनांक'))) {
          regDateKey = key;
        }
      }

      const parsedRecords: MasterExcelRecord[] = [];

      for (let i = 0; i < rawJson.length; i++) {
        const row = rawJson[i];
        let name = nameKey ? String(row[nameKey] || '').trim() : '';

        // If separate First, Middle, Last columns exist, construct full name
        if (firstNameKey || lastNameKey) {
          const fn = firstNameKey ? String(row[firstNameKey] || '').trim() : '';
          const mn = middleNameKey ? String(row[middleNameKey] || '').trim() : '';
          const ln = lastNameKey ? String(row[lastNameKey] || '').trim() : '';
          const combined = [fn, mn, ln].filter(Boolean).join(' ');
          if (combined && (!name || combined.length > name.length)) {
            name = combined;
          }
        }

        let mh = mhKey ? String(row[mhKey] || '').trim() : '';
        let village = villageKey ? String(row[villageKey] || '').trim() : '';
        let taluka = talukaKey ? String(row[talukaKey] || '').trim() : '';
        let district = districtKey ? String(row[districtKey] || '').trim() : '';
        let mobile = mobileKey ? String(row[mobileKey] || '').trim() : '';
        let aadhaar = aadhaarKey ? String(row[aadhaarKey] || '').trim() : '';
        let regDate = regDateKey ? String(row[regDateKey] || '').trim() : '';

        // Fallback check if standard keys didn't match
        if (!name || !mh) {
          for (const k of keys) {
            const val = String(row[k] || '').trim();
            if (!mh && /^MH\d{4,}/i.test(val)) {
              mh = val;
            } else if (!name && val.length > 3 && !/^\d+$/.test(val) && !val.includes('http')) {
              name = val;
            }
          }
        }

        if (name && mh) {
          parsedRecords.push({
            workerName: name,
            mhNumber: mh.toUpperCase(),
            village,
            taluka,
            district,
            mobileNumber: mobile,
            aadhaarNumber: aadhaar,
            registrationDate: regDate,
            rawRow: row,
          });
        }
      }

      if (parsedRecords.length === 0) {
        setErrorMsg(
          'Could not auto-detect Name and MH Registration columns in the uploaded file. Please ensure columns include "Worker Name" and "MH Number".'
        );
        setIsParsing(false);
        return;
      }

      setExcelData(parsedRecords);
    } catch (err: any) {
      setErrorMsg(`Failed to parse Excel file: ${err?.message || err}`);
    } finally {
      setIsParsing(false);
      setProcessingStatus('');
    }
  };

  // Run Master Data Sync Process for BOTH Registrations and Renewals
  const handleSyncMasterData = async () => {
    if (excelData.length === 0) {
      setErrorMsg('Please upload a Master Excel file first.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Building search indexes...');
    setErrorMsg('');

    // Yield to UI to show progress spinner
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      // Step 1: Gather pending Registrations
      const targetRegistrations: TargetRecord[] = registrations
        .filter(
          (reg) =>
            !reg.mhNumber ||
            reg.mhNumber.trim() === '' ||
            reg.status === 'Pending' ||
            reg.status === 'Pending Verification'
        )
        .map((reg) => ({
          id: reg.id,
          type: 'registration',
          workerName: reg.workerName,
          mhNumber: reg.mhNumber,
          village: reg.village,
          taluka: reg.taluka,
          mobileNumber: reg.mobileNumber,
          aadhaarNumber: reg.aadhaarNumber,
          status: reg.status,
          date: reg.registrationDate,
        }));

      // Step 2: Gather pending Renewals
      const targetRenewals: TargetRecord[] = (renewals || [])
        .filter(
          (ren) =>
            !ren.mhNumber ||
            ren.mhNumber.trim() === '' ||
            ren.status === 'Pending'
        )
        .map((ren) => ({
          id: ren.id,
          type: 'renewal',
          workerName: ren.workerName,
          mhNumber: ren.mhNumber,
          village: (ren as any).village || undefined,
          taluka: ren.taluka,
          mobileNumber: ren.mobileNumber,
          status: ren.status,
          date: ren.renewalDate,
        }));

      const allTargets = [...targetRegistrations, ...targetRenewals];
      const totalChecked = allTargets.length;

      // Fast Index Construction
      interface PreprocessedExcel {
        record: MasterExcelRecord;
        mhClean: string;
        mobileClean: string;
        normName: string;
        tokens: string[];
      }

      const preprocessedExcel: PreprocessedExcel[] = excelData.map((ex) => {
        const normName = normalizeName(ex.workerName);
        const tokens = normName.split(' ').filter((t) => t.length > 1);
        const mhClean = ex.mhNumber ? ex.mhNumber.trim().toUpperCase() : '';
        const mobileClean = cleanMobile(ex.mobileNumber);
        return { record: ex, mhClean, mobileClean, normName, tokens };
      });

      const mhMap = new Map<string, MasterExcelRecord[]>();
      const mobileMap = new Map<string, MasterExcelRecord[]>();
      const exactNameMap = new Map<string, MasterExcelRecord[]>();
      const tokenMap = new Map<string, PreprocessedExcel[]>();

      for (const item of preprocessedExcel) {
        if (item.mhClean) {
          const list = mhMap.get(item.mhClean) || [];
          list.push(item.record);
          mhMap.set(item.mhClean, list);
        }
        if (item.mobileClean && item.mobileClean.length === 10) {
          const list = mobileMap.get(item.mobileClean) || [];
          list.push(item.record);
          mobileMap.set(item.mobileClean, list);
        }
        if (item.normName) {
          const list = exactNameMap.get(item.normName) || [];
          list.push(item.record);
          exactNameMap.set(item.normName, list);
        }
        for (const tok of item.tokens) {
          const list = tokenMap.get(tok) || [];
          list.push(item);
          tokenMap.set(tok, list);
        }
      }

      setProcessingStatus(`Matching ${allTargets.length} pending records against Master Excel...`);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const matched: { target: TargetRecord; excel: MasterExcelRecord; matchType?: string }[] = [];
      const multiple: MultipleMatchItem[] = [];
      const pending: TargetRecord[] = [];
      const matchDateStr = new Date().toISOString().split('T')[0];
      let totalOnlyMobileMatches = 0;

      // Step 3: Fast Matching with zero UI blocking
      for (let i = 0; i < allTargets.length; i++) {
        const target = allTargets[i];
        const targetMH = target.mhNumber ? target.mhNumber.trim().toUpperCase() : '';
        const targetMobile = cleanMobile(target.mobileNumber);
        const targetNormName = normalizeName(target.workerName);
        const targetTokens = targetNormName.split(' ').filter((t) => t.length > 1);

        // 1. Priority: Match by MH Number if present
        if (targetMH && mhMap.has(targetMH)) {
          const mhMatches = mhMap.get(targetMH)!;
          if (mhMatches.length === 1) {
            matched.push({ target, excel: mhMatches[0], matchType: 'MH Number' });
            continue;
          } else if (mhMatches.length > 1) {
            multiple.push({ target, candidates: mhMatches, matchReason: 'multiple_name_candidates' });
            continue;
          }
        }

        // 2. Candidate pool by Mobile Number
        const hasMobileMatch = Boolean(targetMobile && targetMobile.length === 10 && mobileMap.has(targetMobile));
        const mobCandidates = hasMobileMatch ? mobileMap.get(targetMobile)! : [];

        // 3. Candidate pool by Name (exact name or token matches)
        const nameCandidateSet = new Set<MasterExcelRecord>();
        if (targetNormName && exactNameMap.has(targetNormName)) {
          for (const m of exactNameMap.get(targetNormName)!) nameCandidateSet.add(m);
        }
        if (targetTokens.length >= 2) {
          const tokenCandidatePool = new Set<PreprocessedExcel>();
          for (const tok of targetTokens) {
            const pool = tokenMap.get(tok);
            if (pool) {
              for (const p of pool) tokenCandidatePool.add(p);
            }
          }

          for (const cand of tokenCandidatePool) {
            const comp = compareWorkerNames(target.workerName, cand.record.workerName);
            if (comp.isFullMatch || (comp.isPartialMatch && comp.matchedTokensCount >= 2)) {
              nameCandidateSet.add(cand.record);
            }
          }
        }
        const nameCandidates = Array.from(nameCandidateSet);

        // CASE A: Mobile number is present in target and matched rows in Master Excel
        // Rule: "MOBILE NUMBER ASLYAS MOBILE NUMBER NI MATCH KR PN NAME PN CHECK KR JR FAKT MOBILE NUMBER MATCH JHALA TR CORRECT OPTION MANUAL MI SELECT KARIL MALA DAKHAV TASA"
        if (mobCandidates.length > 0) {
          // Check if any mobile match ALSO matches First, Middle, and Last name!
          const fullMatchedWithMobile = mobCandidates.filter((cand) => {
            const comp = compareWorkerNames(target.workerName, cand.workerName);
            return comp.isFullMatch;
          });

          if (fullMatchedWithMobile.length === 1) {
            // Both Mobile Number AND First, Middle, Last Name matched!
            matched.push({
              target,
              excel: fullMatchedWithMobile[0],
              matchType: 'Mobile + Full Name (First, Middle, Last)',
            });
            continue;
          } else if (fullMatchedWithMobile.length > 1) {
            multiple.push({
              target,
              candidates: fullMatchedWithMobile,
              matchReason: 'multiple_name_candidates',
              matchedMobile: targetMobile,
            });
            continue;
          }

          // Check if 2 tokens match with mobile
          const partialMatchedWithMobile = mobCandidates.filter((cand) => {
            const comp = compareWorkerNames(target.workerName, cand.workerName);
            return comp.isPartialMatch && comp.matchedTokensCount >= 2;
          });

          if (partialMatchedWithMobile.length === 1) {
            matched.push({
              target,
              excel: partialMatchedWithMobile[0],
              matchType: 'Mobile + 2-Part Name',
            });
            continue;
          }

          // ONLY MOBILE NUMBER MATCHED! (Name does NOT match or is different)
          // Flag for manual operator selection: "JR FAKT MOBILE NUMBER MATCH JHALA TR CORRECT OPTION MANUAL MI SELECT KARIL MALA DAKHAV TASA"
          totalOnlyMobileMatches++;
          multiple.push({
            target,
            candidates: mobCandidates,
            matchReason: 'only_mobile_match',
            matchedMobile: targetMobile,
          });
          continue;
        }

        // CASE B: Mobile not matched / not present.
        // Rule: "FIRST MIDDLE LAST NAME MATCH KR MG ADD KR"
        const fullMatchedNames = nameCandidates.filter((cand) => {
          const comp = compareWorkerNames(target.workerName, cand.workerName);
          return comp.isFullMatch;
        });

        if (fullMatchedNames.length === 1) {
          // Exactly 1 unique worker with matching First, Middle, and Last name!
          matched.push({
            target,
            excel: fullMatchedNames[0],
            matchType: 'First, Middle & Last Name Match',
          });
          continue;
        } else if (fullMatchedNames.length > 1) {
          // Multiple workers in Excel have the same 3-part name
          multiple.push({
            target,
            candidates: fullMatchedNames,
            matchReason: 'multiple_name_candidates',
          });
          continue;
        }

        // Check strong 2-part name match when target has 2 name parts
        const strongPartials = nameCandidates.filter((cand) => {
          const comp = compareWorkerNames(target.workerName, cand.workerName);
          return comp.isPartialMatch && comp.matchedTokensCount >= 2;
        });

        if (strongPartials.length === 1 && targetTokens.length === 2) {
          matched.push({
            target,
            excel: strongPartials[0],
            matchType: 'First & Last Name Match',
          });
          continue;
        } else if (strongPartials.length > 1) {
          multiple.push({
            target,
            candidates: strongPartials,
            matchReason: 'partial_name_match',
          });
          continue;
        }

        // CASE C: No match found
        pending.push(target);
      }

      // Step 4: Batch update matched records in database smoothly
      if (matched.length > 0) {
        setProcessingStatus(`Updating ${matched.length} matched database records...`);
        const BATCH_SIZE = 20;

        for (let i = 0; i < matched.length; i += BATCH_SIZE) {
          const chunk = matched.slice(i, i + BATCH_SIZE);
          setProcessingStatus(`Updating records ${i + 1} to ${Math.min(i + BATCH_SIZE, matched.length)} of ${matched.length}...`);

          await Promise.all(
            chunk.map(async (m) => {
              try {
                const endpoint =
                  m.target.type === 'registration'
                    ? `/api/registrations/${m.target.id}`
                    : `/api/renewals/${m.target.id}`;

                const body =
                  m.target.type === 'registration'
                    ? {
                        mhNumber: m.excel.mhNumber,
                        status: 'Active',
                        appStatus: 'Accepted',
                        matchSource: 'Master Excel',
                        matchDate: matchDateStr,
                      }
                    : {
                        mhNumber: m.excel.mhNumber,
                        status: 'Active',
                        matchSource: 'Master Excel',
                        matchDate: matchDateStr,
                      };

                await fetch(endpoint, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-user-username': currentUser.username,
                    'x-user-role': currentUser.role,
                  },
                  body: JSON.stringify(body),
                });
              } catch (err) {
                console.error(`Error updating ${m.target.type} ${m.target.id}:`, err);
              }
            })
          );

          // Yield execution to keep browser UI crisp and responsive
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      setStats({
        totalChecked,
        totalMatched: matched.length,
        totalMultipleMatches: multiple.length,
        totalPending: pending.length,
        totalOnlyMobileMatches,
      });

      setAutoMatchedList(matched);
      setMultipleMatchesList(multiple);
      setPendingList(pending);
      setSyncDone(true);

      if (multiple.length > 0) {
        setActiveTab('multiple');
      } else if (matched.length > 0) {
        setActiveTab('matched');
      } else {
        setActiveTab('pending');
      }

      // Refresh master lists from backend
      onRefreshRegistrations();
      if (onRefreshRenewals) onRefreshRenewals();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error executing Master Data Sync.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Operator manually resolves multiple match candidate
  const handleResolveMultipleMatch = async (
    target: TargetRecord,
    selectedCandidate: MasterExcelRecord
  ) => {
    setIsUpdatingSingle(true);
    const matchDateStr = new Date().toISOString().split('T')[0];

    try {
      const endpoint =
        target.type === 'registration'
          ? `/api/registrations/${target.id}`
          : `/api/renewals/${target.id}`;

      const body =
        target.type === 'registration'
          ? {
              mhNumber: selectedCandidate.mhNumber,
              status: 'Active',
              appStatus: 'Accepted',
              matchSource: 'Master Excel',
              matchDate: matchDateStr,
            }
          : {
              mhNumber: selectedCandidate.mhNumber,
              status: 'Active',
              matchSource: 'Master Excel',
              matchDate: matchDateStr,
            };

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Failed to update ${target.type} record.`);

      // Remove item from multiple matches list & increment matched count
      setMultipleMatchesList((prev) => prev.filter((item) => item.target.id !== target.id));
      setStats((prev) => ({
        ...prev,
        totalMatched: prev.totalMatched + 1,
        totalMultipleMatches: Math.max(0, prev.totalMultipleMatches - 1),
      }));

      setSelectedResolution(null);
      onRefreshRegistrations();
      if (onRefreshRenewals) onRefreshRenewals();
    } catch (err: any) {
      alert(err?.message || 'Failed to sync selected match.');
    } finally {
      setIsUpdatingSingle(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-semibold tracking-wide border border-indigo-500/30 flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5" /> MASTER DATA AUTO-SYNC
              </span>
              <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-medium border border-emerald-500/30">
                Registration & Renewal Matching
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              Master Excel Data Sync (Registration & Renewal)
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Upload government approved Master Excel. Automatically compares existing pending Registrations & Renewals by Full Name or MH Number, assigns MH Numbers, updates status to Active, and lets operators resolve duplicates seamlessly.
            </p>
          </div>
        </div>
      </div>

      {/* Safety Workflow Principles Box */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-950 space-y-2">
        <div className="font-bold flex items-center gap-1.5 text-indigo-900 text-sm">
          <ShieldCheck className="w-4 h-4 text-indigo-600" /> सुरक्षित डेटा मॅचिंग नियम (Strict Matching Rules):
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-indigo-800">
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-900 block mb-0.5">1. नाव, मधले नाव व आडनाव (Full Name Match)</span>
            पहिले नाव, मधले नाव व आडनाव (First, Middle, Last Name) तंतोतंत जुळल्यावरच रेकॉर्ड सिस्टीममध्ये Active केले जाते.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-900 block mb-0.5">2. मोबाईल + नाव तपासणी (Mobile & Name)</span>
            मोबाईल नंबर असल्यास मोबाईल आणि नाव दोन्ही तपासून खात्रीपूर्वक मॅच केले जाते.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200 bg-amber-50/50">
            <span className="font-bold text-amber-900 block mb-0.5">3. केवळ मोबाईल जुळल्यास मॅन्युअल पर्याय</span>
            केवळ मोबाईल जुळल्यास व नाव वेगळे असल्यास आपोआप बदल होत नाही; ऑपरेटर स्वतः योग्य पर्याय मॅन्युअली निवडू शकतात.
          </div>
        </div>
      </div>

      {/* File Upload & Sync Control Panel */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              Upload Government Master Excel File
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select an .xlsx, .xls or .csv file containing approved worker registrations and renewals.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className={`px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 border border-slate-200 ${isParsing || isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
              {isParsing ? (
                <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 text-slate-600" />
              )}
              {isParsing ? 'Uploading File...' : fileName ? 'Change Excel File' : 'Browse File...'}
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                disabled={isParsing || isProcessing}
                className="hidden"
              />
            </label>

            <button
              onClick={handleSyncMasterData}
              disabled={excelData.length === 0 || isProcessing || isParsing}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Syncing Master Data...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Sync Master Data
                </>
              )}
            </button>
          </div>
        </div>

        {(isParsing || isProcessing) && (
          <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 text-xs flex items-center gap-3 animate-pulse">
            <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
            <div className="font-semibold">{processingStatus || 'Processing Excel data... Please wait.'}</div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        {fileName && (
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              Selected File: <span className="font-bold text-slate-900">{fileName}</span>
            </div>
            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md font-semibold text-[11px] border border-indigo-100">
              {excelData.length} Worker Records Loaded
            </span>
          </div>
        )}
      </div>

      {/* Sync Summary Dashboard Cards */}
      {syncDone && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Records Checked
              </span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.totalChecked}</div>
              <span className="text-[11px] text-slate-500">Registrations & Renewals</span>
            </div>
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
              <Filter className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-emerald-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-emerald-50/30">
            <div>
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                Total Records Matched
              </span>
              <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.totalMatched}</div>
              <span className="text-[11px] text-emerald-600">Updated with MH & Active</span>
            </div>
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-amber-200/80 shadow-xs flex items-center justify-between bg-gradient-to-br from-white to-amber-50/30">
            <div>
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
                Multiple & Manual Matches
              </span>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {stats.totalMultipleMatches}
              </div>
              <span className="text-[11px] text-amber-600 block">
                {stats.totalOnlyMobileMatches && stats.totalOnlyMobileMatches > 0 ? (
                  <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900 font-bold text-[10px]">
                    ⚠️ {stats.totalOnlyMobileMatches} केवळ मोबाईल जुळलेले
                  </span>
                ) : (
                  'Requires operator selection'
                )}
              </span>
            </div>
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center">
              <HelpCircle className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Records Pending
              </span>
              <div className="text-2xl font-bold text-slate-700 mt-1">{stats.totalPending}</div>
              <span className="text-[11px] text-slate-400">Not found in Master Excel</span>
            </div>
            <div className="w-12 h-12 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Sync Results & Breakdown Tabs */}
      {syncDone && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 space-y-5">
          {/* Sub Navigation */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <button
              onClick={() => setActiveTab('multiple')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'multiple'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              Multiple / Manual Matches ({multipleMatchesList.length})
            </button>

            <button
              onClick={() => setActiveTab('matched')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'matched'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Auto-Matched Records ({autoMatchedList.length})
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-slate-700 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Unmatched Pending ({pendingList.length})
            </button>
          </div>

          {/* TAB 1: Multiple Matches & Manual Resolution View */}
          {activeTab === 'multiple' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Multiple Candidates & Mobile-Only Matches</span>
                    <span className="text-xs font-normal text-amber-800">
                      (केवळ मोबाईल जुळलेले किंवा एकापेक्षा जास्त उमेदवार)
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    केवळ मोबाईल जुळल्यास नाव वेगळे असू शकते. कृपया खात्री करून मॅन्युअली सिलेक्ट करा.
                  </p>
                </div>

                {/* Sub-filters for Multiple Matches tab */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    onClick={() => setManualFilter('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      manualFilter === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    सर्व ({multipleMatchesList.length})
                  </button>
                  <button
                    onClick={() => setManualFilter('only_mobile')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      manualFilter === 'only_mobile'
                        ? 'bg-amber-600 text-white'
                        : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    ⚠️ केवळ मोबाईल ({multipleMatchesList.filter((i) => i.matchReason === 'only_mobile_match').length})
                  </button>
                  <button
                    onClick={() => setManualFilter('multi_name')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      manualFilter === 'multi_name'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
                    }`}
                  >
                    👥 नाव उमेदवार ({multipleMatchesList.filter((i) => i.matchReason !== 'only_mobile_match').length})
                  </button>
                </div>
              </div>

              {(() => {
                const displayedItems = multipleMatchesList.filter((item) => {
                  if (manualFilter === 'only_mobile') return item.matchReason === 'only_mobile_match';
                  if (manualFilter === 'multi_name') return item.matchReason !== 'only_mobile_match';
                  return true;
                });

                if (displayedItems.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      या फिल्टरमध्ये कोणतेही रेकॉर्ड उपलब्ध नाहीत.
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {displayedItems.map((item) => {
                      const isOnlyMobile = item.matchReason === 'only_mobile_match';
                      const primaryCandidate = item.candidates[0];

                      return (
                        <div
                          key={item.target.id}
                          className={`rounded-xl p-4 space-y-3 border ${
                            isOnlyMobile
                              ? 'bg-amber-50/50 border-amber-300'
                              : 'bg-indigo-50/30 border-indigo-200'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                    item.target.type === 'registration'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-purple-100 text-purple-800'
                                  }`}
                                >
                                  {item.target.type === 'registration'
                                    ? 'REGISTRATION (नोंदणी)'
                                    : 'RENEWAL (नूतनीकरण)'}
                                </span>

                                {isOnlyMobile && (
                                  <span className="px-2 py-0.5 bg-amber-200 text-amber-950 text-[10px] font-bold rounded border border-amber-300">
                                    ⚠️ केवळ मोबाईल जुळला
                                  </span>
                                )}
                              </div>

                              <h4 className="font-bold text-slate-900 text-sm mt-1">
                                {item.target.workerName}
                              </h4>
                            </div>

                            <span className="px-2 py-0.5 bg-slate-100 text-slate-800 text-[11px] font-bold rounded-md border border-slate-200">
                              {item.candidates.length} Candidates
                            </span>
                          </div>

                          {/* Notice banner for Mobile-only match */}
                          {isOnlyMobile && (
                            <div className="p-2 bg-amber-100/90 border border-amber-200 rounded-lg text-amber-900 text-[11px] font-medium leading-relaxed">
                              ⚠️ <strong>केवळ मोबाईल नंबर जुळला ({item.matchedMobile || item.target.mobileNumber})!</strong>
                              <br />
                              सिस्टीममधील नाव व एक्सेल मधील नाव जुळत नाही. कृपया खालील उमेदवाराची खात्री करून मॅन्युअली सिलेक्ट करा.
                            </div>
                          )}

                          {/* Reference Target Details */}
                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200">
                            <div>
                              <span className="text-slate-400 text-[10px] block">सिस्टीम गाव / तालुका</span>
                              <span className="font-semibold text-slate-800">
                                {item.target.village || item.target.taluka || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 text-[10px] block">सिस्टीम मोबाईल</span>
                              <span className="font-bold text-indigo-700">
                                {item.target.mobileNumber || 'N/A'}
                              </span>
                            </div>
                          </div>

                          {/* Candidate Preview Box */}
                          {item.candidates.length === 1 && primaryCandidate ? (
                            <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-1">
                              <span className="text-[10px] uppercase font-bold text-emerald-800 block">
                                एक्सेल मधील उमेदवार (Excel Match):
                              </span>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">{primaryCandidate.workerName}</span>
                                <span className="font-mono font-bold text-emerald-800 text-[11px] bg-emerald-100 px-1.5 py-0.5 rounded">
                                  {primaryCandidate.mhNumber}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600 flex items-center justify-between">
                                <span>गाव: {primaryCandidate.village || primaryCandidate.taluka || '-'}</span>
                                <span>मोबाईल: {primaryCandidate.mobileNumber || '-'}</span>
                              </div>
                            </div>
                          ) : null}

                          {/* Actions */}
                          <div className="flex items-center gap-2 pt-1">
                            {item.candidates.length === 1 && primaryCandidate ? (
                              <button
                                onClick={() => handleResolveMultipleMatch(item.target, primaryCandidate)}
                                disabled={isUpdatingSingle}
                                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" /> मॅन्युअली सिलेक्ट करा (Select & Sync)
                              </button>
                            ) : null}

                            <button
                              onClick={() => setSelectedResolution(item)}
                              className={`${
                                item.candidates.length === 1 ? 'px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700' : 'w-full py-2 bg-amber-600 hover:bg-amber-700 text-white'
                              } rounded-lg font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer`}
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              {item.candidates.length > 1
                                ? `योग्य उमेदवार निवडा (${item.candidates.length} Candidates)`
                                : 'तपशील पहा'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 2: Auto-Matched Records View */}
          {activeTab === 'matched' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                These existing records matched in the Master Excel by Full Name / MH Number and have been automatically updated in the database.
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3.5">Record Type</th>
                      <th className="py-2.5 px-3.5">Worker Name</th>
                      <th className="py-2.5 px-3.5">MH Number</th>
                      <th className="py-2.5 px-3.5">Taluka / Village</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5">मॅच प्रकार (Match Type)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {autoMatchedList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-slate-400">
                          No auto-matched records.
                        </td>
                      </tr>
                    ) : (
                      autoMatchedList.map((m) => (
                        <tr key={m.target.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                m.target.type === 'registration'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {m.target.type === 'registration' ? 'Registration' : 'Renewal'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-800">
                            {m.target.workerName}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-indigo-600">
                            {m.excel.mhNumber}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {m.target.village || m.target.taluka || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded">
                              ACTIVE
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-700 font-medium">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[11px] font-semibold border border-indigo-100">
                              {(m as any).matchType || 'Master Excel'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Unmatched Pending Records View */}
          {activeTab === 'pending' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                These existing records were not found in the uploaded Master Excel and remain unchanged.
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3.5">Record Type</th>
                      <th className="py-2.5 px-3.5">Worker Name</th>
                      <th className="py-2.5 px-3.5">Mobile</th>
                      <th className="py-2.5 px-3.5">Taluka</th>
                      <th className="py-2.5 px-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-slate-400">
                          No pending unmatched records.
                        </td>
                      </tr>
                    ) : (
                      pendingList.map((target) => (
                        <tr key={target.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3.5">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                target.type === 'registration'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {target.type === 'registration' ? 'Registration' : 'Renewal'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-800">
                            {target.workerName}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-600">
                            {target.mobileNumber || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">{target.taluka || 'N/A'}</td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold text-[10px] rounded">
                              {target.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Operator Multiple Matches Selection Modal */}
      {selectedResolution && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      selectedResolution.target.type === 'registration'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {selectedResolution.target.type === 'registration' ? 'Registration' : 'Renewal'}
                  </span>
                  {selectedResolution.matchReason === 'only_mobile_match' && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold rounded">
                      ⚠️ केवळ मोबाईल जुळला (Mobile-Only Match)
                    </span>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base">
                  {selectedResolution.matchReason === 'only_mobile_match'
                    ? `मॅन्युअल निवड: ${selectedResolution.target.workerName}`
                    : `Resolve Multiple Match for: ${selectedResolution.target.workerName}`}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedResolution.matchReason === 'only_mobile_match'
                    ? `केवळ मोबाईल क्रमांक (${selectedResolution.matchedMobile || selectedResolution.target.mobileNumber}) जुळला आहे. नाव जुळत नाही. कृपया खात्री करून योग्य उमेदवार सिलेक्ट करा.`
                    : 'Multiple records in Master Excel match this name. Please select the correct worker below.'}
                </p>
              </div>
              <button
                onClick={() => setSelectedResolution(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedResolution.matchReason === 'only_mobile_match' && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> केवळ मोबाईल नंबर जुळला - सावधगिरीची सूचना:
                </div>
                <p className="text-[11px] text-amber-900">
                  सिस्टीममधील कामगाराचे नाव <strong>"{selectedResolution.target.workerName}"</strong> आणि एक्सेल मधील नाव खालीलप्रमाणे वेगळे आहे. जर हीच व्यक्ती असेल किंवा कुटुंबातील एकाच मोबाईलवर नोंदणी असेल, तर खालील हिरवे <strong>"मॅन्युअली निवडा (Select & Sync)"</strong> बटण दाबा.
                </p>
              </div>
            )}

            {/* Existing Reference Info */}
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs grid grid-cols-3 gap-3">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Worker Name
                </span>
                <span className="font-bold text-slate-800">
                  {selectedResolution.target.workerName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Village / Taluka
                </span>
                <span className="font-semibold text-slate-800">
                  {selectedResolution.target.village ||
                    selectedResolution.target.taluka ||
                    'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Mobile / Aadhaar
                </span>
                <span className="font-semibold text-slate-800">
                  {selectedResolution.target.mobileNumber || 'N/A'}
                </span>
              </div>
            </div>

            {/* Candidate List */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 block">
                {selectedResolution.matchReason === 'only_mobile_match'
                  ? 'मोबाईल क्रमांकाशी जुळणारे एक्सेल रेकॉर्ड (मॅन्युअली निवड करा):'
                  : 'Select Master Excel Candidate to Sync:'}
              </span>

              {selectedResolution.candidates.map((cand, idx) => (
                <div
                  key={idx}
                  className="bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-900 text-sm">{cand.workerName}</span>
                      <span className="px-2 py-0.5 bg-indigo-600 text-white font-mono font-bold rounded text-[11px]">
                        MH: {cand.mhNumber}
                      </span>
                    </div>
                    <div className="text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                      {cand.village && <span>Village: <strong>{cand.village}</strong></span>}
                      {cand.taluka && <span>Taluka: <strong>{cand.taluka}</strong></span>}
                      {cand.district && <span>District: <strong>{cand.district}</strong></span>}
                      {cand.mobileNumber && <span>Mobile: <strong>{cand.mobileNumber}</strong></span>}
                    </div>
                  </div>

                  <button
                    onClick={() =>
                      handleResolveMultipleMatch(selectedResolution.target, cand)
                    }
                    disabled={isUpdatingSingle}
                    className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold rounded-lg text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" /> Select & Sync
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedResolution(null)}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
