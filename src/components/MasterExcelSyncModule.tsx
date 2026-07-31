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
import { User, WorkerRegistration } from '../types';

interface MasterExcelSyncModuleProps {
  currentUser: User;
  registrations: WorkerRegistration[];
  onRefreshRegistrations: () => void;
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

export interface MultipleMatchItem {
  registration: WorkerRegistration;
  candidates: MasterExcelRecord[];
}

export interface SyncStats {
  totalChecked: number;
  totalMatched: number;
  totalPending: number;
  totalMultipleMatches: number;
}

// Helper to normalize names for smart matching
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\b(mr|mrs|ms|shri|shrimati|smt|kumari|kumar|dr)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Token set matching (handles name order variations e.g. "Patil Ramesh" vs "Ramesh Patil")
export function isNameMatch(name1: string, name2: string): boolean {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);

  if (!norm1 || !norm2) return false;
  if (norm1 === norm2) return true;

  const tokens1 = norm1.split(' ').filter((t) => t.length > 1);
  const tokens2 = norm2.split(' ').filter((t) => t.length > 1);

  if (tokens1.length === 0 || tokens2.length === 0) return false;

  // Check if all tokens of shorter name exist in longer name
  const [shorter, longer] =
    tokens1.length <= tokens2.length ? [tokens1, tokens2] : [tokens2, tokens1];
  const allMatch = shorter.every((token) => longer.includes(token));

  return allMatch && shorter.length >= 2;
}

export const MasterExcelSyncModule: React.FC<MasterExcelSyncModuleProps> = ({
  currentUser,
  registrations,
  onRefreshRegistrations,
}) => {
  const [excelData, setExcelData] = useState<MasterExcelRecord[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [syncDone, setSyncDone] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [stats, setStats] = useState<SyncStats>({
    totalChecked: 0,
    totalMatched: 0,
    totalPending: 0,
    totalMultipleMatches: 0,
  });

  const [autoMatchedList, setAutoMatchedList] = useState<
    { reg: WorkerRegistration; excel: MasterExcelRecord }[]
  >([]);
  const [multipleMatchesList, setMultipleMatchesList] = useState<MultipleMatchItem[]>([]);
  const [pendingList, setPendingList] = useState<WorkerRegistration[]>([]);

  const [activeTab, setActiveTab] = useState<'multiple' | 'matched' | 'pending'>('multiple');
  const [selectedResolution, setSelectedResolution] = useState<MultipleMatchItem | null>(null);
  const [isUpdatingSingle, setIsUpdatingSingle] = useState<boolean>(false);

  // Parse Excel / CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setFileName(file.name);
    setSyncDone(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setErrorMsg('The selected Excel file appears to be empty.');
          return;
        }

        // Detect column mappings dynamically
        const parsedRecords: MasterExcelRecord[] = [];

        rawJson.forEach((row: any) => {
          let name = '';
          let mh = '';
          let village = '';
          let taluka = '';
          let district = '';
          let mobile = '';
          let aadhaar = '';
          let regDate = '';

          // Column key matching logic
          Object.keys(row).forEach((key) => {
            const kLower = key.toLowerCase().trim();
            const val = String(row[key]).trim();

            if (
              !name &&
              (kLower.includes('worker') ||
                kLower.includes('name') ||
                kLower.includes('नाव') ||
                kLower.includes('नांव') ||
                kLower.includes('applicant'))
            ) {
              name = val;
            } else if (
              !mh &&
              (kLower.includes('mh') ||
                kLower.includes('registration') ||
                kLower.includes('bocw') ||
                kLower.includes('नोंदणी क्रमांक') ||
                kLower.includes('reg no'))
            ) {
              mh = val;
            } else if (!village && (kLower.includes('village') || kLower.includes('गाव') || kLower.includes('gram'))) {
              village = val;
            } else if (!taluka && (kLower.includes('taluka') || kLower.includes('तालुका'))) {
              taluka = val;
            } else if (!district && (kLower.includes('district') || kLower.includes('जिल्हा'))) {
              district = val;
            } else if (!mobile && (kLower.includes('mobile') || kLower.includes('phone') || kLower.includes('मोबाईल'))) {
              mobile = val;
            } else if (!aadhaar && (kLower.includes('aadhaar') || kLower.includes('adhar') || kLower.includes('आधार'))) {
              aadhaar = val;
            } else if (!regDate && (kLower.includes('date') || kLower.includes('तारीख'))) {
              regDate = val;
            }
          });

          // Fallback check if headers didn't match standard names
          if (!name || !mh) {
            const vals = Object.values(row).map((v) => String(v).trim());
            vals.forEach((v) => {
              if (!mh && /^MH\d{4,}/i.test(v)) {
                mh = v;
              } else if (!name && v.length > 3 && !/^\d+$/.test(v) && !v.includes('http')) {
                name = v;
              }
            });
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
        });

        if (parsedRecords.length === 0) {
          setErrorMsg(
            'Could not auto-detect Name and MH Registration columns in the uploaded file. Please ensure columns include "Worker Name" and "MH Number".'
          );
          return;
        }

        setExcelData(parsedRecords);
      } catch (err: any) {
        setErrorMsg(`Failed to parse Excel file: ${err?.message || err}`);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Run Master Data Sync Process
  const handleSyncMasterData = async () => {
    if (excelData.length === 0) {
      setErrorMsg('Please upload a Master Excel file first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg('');

    try {
      // Step 5: Filter existing registrations whose MH Number is empty or status is Pending
      const targetRegistrations = registrations.filter(
        (reg) =>
          !reg.mhNumber ||
          reg.mhNumber.trim() === '' ||
          reg.status === 'Pending' ||
          reg.status === 'Pending Verification'
      );

      const totalChecked = targetRegistrations.length;
      const matched: { reg: WorkerRegistration; excel: MasterExcelRecord }[] = [];
      const multiple: MultipleMatchItem[] = [];
      const pending: WorkerRegistration[] = [];

      const matchDateStr = new Date().toISOString().split('T')[0];

      // Perform matching against uploaded Master Excel data
      for (const reg of targetRegistrations) {
        const foundCandidates = excelData.filter((ex) => isNameMatch(reg.workerName, ex.workerName));

        if (foundCandidates.length === 1) {
          // Exactly 1 match found -> Auto match
          matched.push({ reg, excel: foundCandidates[0] });
        } else if (foundCandidates.length > 1) {
          // Multiple matches found -> Operator selection required
          multiple.push({ registration: reg, candidates: foundCandidates });
        } else {
          // No match found -> Leave unchanged
          pending.push(reg);
        }
      }

      // Step 7: Update single-matched records in database (TiDB)
      for (const m of matched) {
        try {
          await fetch(`/api/registrations/${m.reg.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'x-user-username': currentUser.username,
              'x-user-role': currentUser.role,
            },
            body: JSON.stringify({
              mhNumber: m.excel.mhNumber,
              status: 'Active',
              appStatus: 'Accepted',
              matchSource: 'Master Excel',
              matchDate: matchDateStr,
            }),
          });
        } catch (err) {
          console.error(`Error updating registration ${m.reg.id}:`, err);
        }
      }

      setStats({
        totalChecked,
        totalMatched: matched.length,
        totalMultipleMatches: multiple.length,
        totalPending: pending.length,
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

      // Refresh master list from backend
      onRefreshRegistrations();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error executing Master Data Sync.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Operator manually resolves multiple match candidate
  const handleResolveMultipleMatch = async (
    registrationId: string,
    selectedCandidate: MasterExcelRecord
  ) => {
    setIsUpdatingSingle(true);
    const matchDateStr = new Date().toISOString().split('T')[0];

    try {
      const res = await fetch(`/api/registrations/${registrationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          mhNumber: selectedCandidate.mhNumber,
          status: 'Active',
          appStatus: 'Accepted',
          matchSource: 'Master Excel',
          matchDate: matchDateStr,
        }),
      });

      if (!res.ok) throw new Error('Failed to update registration record.');

      // Remove item from multiple matches list & increment matched count
      setMultipleMatchesList((prev) => prev.filter((item) => item.registration.id !== registrationId));
      setStats((prev) => ({
        ...prev,
        totalMatched: prev.totalMatched + 1,
        totalMultipleMatches: Math.max(0, prev.totalMultipleMatches - 1),
      }));

      setSelectedResolution(null);
      onRefreshRegistrations();
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
                Non-Destructive Matching Engine
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              Master Excel Registration Sync
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Upload government approved Master Excel. Automatically compares existing pending registrations by Full Name, assigns MH Numbers, updates status to Active, and lets operators resolve duplicates seamlessly.
            </p>
          </div>
        </div>
      </div>

      {/* Safety Workflow Principles Box */}
      <div className="bg-indigo-50/70 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-950 space-y-2">
        <div className="font-bold flex items-center gap-1.5 text-indigo-900 text-sm">
          <ShieldCheck className="w-4 h-4 text-indigo-600" /> Strict Database Protection Rules:
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-indigo-800">
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-900 block mb-0.5">1. No Unwanted Imports</span>
            Master Excel is never dumped into database. Only existing pending registrations get updated.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-900 block mb-0.5">2. Smart Name Matching</span>
            Normalizes honorifics and matches full names even if first/last name order differs.
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-indigo-100">
            <span className="font-bold text-indigo-900 block mb-0.5">3. Multi-Match Resolution</span>
            If multiple candidates exist, operators can view village & MH number to choose accurately.
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
              Select an .xlsx, .xls or .csv file containing approved worker registrations with MH Numbers.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold text-xs cursor-pointer transition-all flex items-center gap-2 border border-slate-200">
              <Upload className="w-4 h-4 text-slate-600" />
              {fileName ? 'Change Excel File' : 'Browse File...'}
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <button
              onClick={handleSyncMasterData}
              disabled={excelData.length === 0 || isProcessing}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-semibold text-xs shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Sync Summary Dashboard Cards (Requirement 14) */}
      {syncDone && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Records Checked
              </span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.totalChecked}</div>
              <span className="text-[11px] text-slate-500">Pending / No MH in database</span>
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
                Total Multiple Matches
              </span>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {stats.totalMultipleMatches}
              </div>
              <span className="text-[11px] text-amber-600">Requires operator selection</span>
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'multiple'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              Multiple Matches ({multipleMatchesList.length})
            </button>

            <button
              onClick={() => setActiveTab('matched')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
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
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'bg-slate-700 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Unmatched Pending ({pendingList.length})
            </button>
          </div>

          {/* TAB 1: Multiple Matches Resolution View (Requirement 8) */}
          {activeTab === 'multiple' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Multiple Candidates Found in Master Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    Click "Resolve Match" to select the exact worker using Village, Taluka, or MH Number.
                  </p>
                </div>
              </div>

              {multipleMatchesList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No multiple matches requiring manual resolution.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {multipleMatchesList.map((item) => (
                    <div
                      key={item.registration.id}
                      className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">
                            Existing Registration
                          </div>
                          <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                            {item.registration.workerName}
                          </h4>
                        </div>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[11px] font-bold rounded-md">
                          {item.candidates.length} Candidates
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-amber-100">
                        <div>
                          <span className="text-slate-400 text-[10px] block">Village / Taluka</span>
                          <span className="font-semibold text-slate-800">
                            {item.registration.village || item.registration.taluka || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">Mobile / Aadhaar</span>
                          <span className="font-semibold text-slate-800">
                            {item.registration.mobileNumber || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => setSelectedResolution(item)}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-xs shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Select Correct Worker
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Auto-Matched Records View (Requirement 7) */}
          {activeTab === 'matched' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                These existing records matched exactly 1 row in the Master Excel and have been updated in TiDB.
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3.5">Worker Name</th>
                      <th className="py-2.5 px-3.5">New MH Number</th>
                      <th className="py-2.5 px-3.5">Taluka / Village</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5">Match Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {autoMatchedList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-6 text-slate-400">
                          No auto-matched records.
                        </td>
                      </tr>
                    ) : (
                      autoMatchedList.map((m) => (
                        <tr key={m.reg.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3.5 font-bold text-slate-800">
                            {m.reg.workerName}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-bold text-indigo-600">
                            {m.excel.mhNumber}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">
                            {m.reg.village || m.reg.taluka}
                          </td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded">
                              ACTIVE
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-500 font-medium">
                            Master Excel
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: Unmatched Pending Records View (Requirement 9) */}
          {activeTab === 'pending' && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                These existing registrations were not found in the uploaded Master Excel and remain unchanged.
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3.5">Worker Name</th>
                      <th className="py-2.5 px-3.5">Mobile</th>
                      <th className="py-2.5 px-3.5">Taluka</th>
                      <th className="py-2.5 px-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-6 text-slate-400">
                          No pending unmatched records.
                        </td>
                      </tr>
                    ) : (
                      pendingList.map((reg) => (
                        <tr key={reg.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3.5 font-bold text-slate-800">
                            {reg.workerName}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-slate-600">
                            {reg.mobileNumber}
                          </td>
                          <td className="py-2.5 px-3.5 text-slate-600">{reg.taluka}</td>
                          <td className="py-2.5 px-3.5">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-semibold text-[10px] rounded">
                              {reg.status}
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

      {/* Operator Multiple Matches Selection Modal (Requirement 8) */}
      {selectedResolution && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Resolve Multiple Match for: {selectedResolution.registration.workerName}
                </h3>
                <p className="text-xs text-slate-500">
                  Multiple records in Master Excel match this name. Please select the correct worker below.
                </p>
              </div>
              <button
                onClick={() => setSelectedResolution(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Existing Registration Reference Info */}
            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs grid grid-cols-3 gap-3">
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Worker Name
                </span>
                <span className="font-bold text-slate-800">
                  {selectedResolution.registration.workerName}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Village / Taluka
                </span>
                <span className="font-semibold text-slate-800">
                  {selectedResolution.registration.village ||
                    selectedResolution.registration.taluka ||
                    'N/A'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] uppercase font-bold block">
                  Mobile / Aadhaar
                </span>
                <span className="font-semibold text-slate-800">
                  {selectedResolution.registration.mobileNumber || 'N/A'}
                </span>
              </div>
            </div>

            {/* Candidate List */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 block">
                Select Master Excel Candidate to Sync:
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
                      handleResolveMultipleMatch(selectedResolution.registration.id, cand)
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
