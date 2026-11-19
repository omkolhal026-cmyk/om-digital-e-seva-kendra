import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Building2,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Save,
  RotateCcw,
  Layers,
  Users,
  IndianRupee,
  ShieldCheck,
  Check,
  Copy,
  Database,
  RefreshCw,
} from 'lucide-react';
import { WorkerClaim, AdhikariTalukaCommissionRecord, AdhikariPaymentStatus } from '../types';
import { formatDate } from '../utils/exportUtils';
import { getClaimFinancials } from '../utils/claimFinancials';
import { toast } from '../utils/toastConfig';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';

export type { AdhikariTalukaCommissionRecord, AdhikariPaymentStatus };

interface AdhikariCommissionManagementPanelProps {
  listNumber: string;
  claims: WorkerClaim[];
  onBackToLists: () => void;
  currentUser?: { name?: string; role?: string; username?: string };
}

export const ADHIKARI_COMMISSION_STORAGE_KEY = 'OM_DIGITAL_ADHIKARI_COMMISSION_V1';
const STORAGE_KEY = ADHIKARI_COMMISSION_STORAGE_KEY;

export const AdhikariCommissionManagementPanel: React.FC<AdhikariCommissionManagementPanelProps> = ({
  listNumber,
  claims,
  onBackToLists,
  currentUser,
}) => {
  const isAdmin = Boolean(
    currentUser && (currentUser.role === 'admin' || String(currentUser.role).toLowerCase() === 'admin')
  );

  // 1. Filter claims strictly belonging to this List Number (Strict Rule: Do not show other lists)
  const listClaims = useMemo(() => {
    return claims.filter((c) => (c.listNumber || '').trim() === listNumber.trim());
  }, [claims, listNumber]);

  // 2. Discover all available Talukas in the selected List Number
  const availableTalukas = useMemo(() => {
    const set = new Set<string>();
    listClaims.forEach((c) => {
      const t = (c.taluka || '').trim();
      if (t) set.add(t);
    });
    // Fallback common talukas if claims don't specify taluka
    if (set.size === 0) {
      ['Ambegaon', 'Junnar', 'Khed', 'Shirur'].forEach((t) => set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [listClaims]);

  // Selected Taluka State (Dropdown)
  const [selectedTaluka, setSelectedTaluka] = useState<string>('');
  const [fromSourceFilter, setFromSourceFilter] = useState<string>('');

  // Set default taluka when availableTalukas loads
  useEffect(() => {
    if (availableTalukas.length > 0 && (!selectedTaluka || !availableTalukas.includes(selectedTaluka))) {
      setSelectedTaluka(availableTalukas[0]);
    }
  }, [availableTalukas, selectedTaluka]);

  // 3. Claims belonging strictly to the selected Taluka in this List Number (and optionally filtered by FROM source)
  const talukaClaims = useMemo(() => {
    if (!selectedTaluka) return [];
    let list = listClaims.filter(
      (c) => (c.taluka || '').trim().toLowerCase() === selectedTaluka.trim().toLowerCase()
    );
    if (fromSourceFilter && fromSourceFilter !== 'All') {
      list = list.filter(
        (c) => (c.fromSource || '').trim().toLowerCase() === fromSourceFilter.trim().toLowerCase()
      );
    }
    return list;
  }, [listClaims, selectedTaluka, fromSourceFilter]);

  // Total Government Scheme Amount for this Taluka (strictly based on Approved Schemes)
  const talukaTotalGovtAmount = useMemo(() => {
    return talukaClaims.reduce((sum, c) => {
      return sum + getClaimFinancials(c).totalApprovedAmount;
    }, 0);
  }, [talukaClaims]);

  // 4. Commission Store & Database Synchronization State
  const [commissionStore, setCommissionStore] = useState<{ [key: string]: AdhikariTalukaCommissionRecord }>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState<boolean | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  // Helper key generator: List Number + Taluka
  const getStoreKey = (listNum: string, talukaName: string) => {
    return `${(listNum || '').trim()}__${(talukaName || '').trim().toLowerCase()}`;
  };

  // Helper for auth headers
  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem('om_eseva_token') ||
      sessionStorage.getItem('om_eseva_token') ||
      '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (currentUser?.username) headers['x-user-username'] = currentUser.username;
    return headers;
  };

  // Fetch from Backend Database (/api/adhikari-commissions)
  const fetchDatabaseRecords = async () => {
    if (!isAdmin) {
      setIsLoading(false);
      setIsInitialized(true);
      return;
    }
    setIsLoading(true);
    setDbError(null);
    try {
      const res = await fetch(
        `/api/adhikari-commissions?listNumber=${encodeURIComponent(listNumber.trim())}`,
        {
          headers: getAuthHeaders(),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.records)) {
        const dbMap: { [key: string]: AdhikariTalukaCommissionRecord } = {};
        data.records.forEach((rec: AdhikariTalukaCommissionRecord) => {
          const k = getStoreKey(rec.listNumber, rec.taluka);
          dbMap[k] = rec;
        });
        setCommissionStore(dbMap);
        setIsDbConnected(true);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(dbMap));
        } catch (_) {}
      } else {
        throw new Error(data.error || 'Database मधून डेटा मिळवता आला नाही.');
      }
    } catch (err: any) {
      console.warn('Database fetch failed, falling back to local cache:', err);
      setIsDbConnected(false);
      setDbError(err?.message || 'Database कनेक्शन त्रुटी');
      // Offline fallback: load from localStorage if available
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          setCommissionStore(JSON.parse(raw));
        }
      } catch (_) {}
    } finally {
      setIsLoading(false);
      setIsInitialized(true);
    }
  };

  // Load from Database on mount and listNumber change
  useEffect(() => {
    if (!isAdmin) return;
    fetchDatabaseRecords();
  }, [listNumber, isAdmin]);

  // 5. Total Adhikari Commission Form States for the selected Taluka
  const [enterAmountInput, setEnterAmountInput] = useState<string>('');
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [paidDateInput, setPaidDateInput] = useState<string>('');
  const [copiedMh, setCopiedMh] = useState<string | null>(null);

  // Currently saved record in Database for the selected Taluka
  const currentSavedRecord = useMemo(() => {
    if (!selectedTaluka) return null;
    const currentKey = getStoreKey(listNumber, selectedTaluka);
    return commissionStore[currentKey] || null;
  }, [commissionStore, listNumber, selectedTaluka]);

  // When selectedTaluka or commissionStore changes, load that taluka's saved commission entry
  useEffect(() => {
    if (!selectedTaluka) return;
    const currentKey = getStoreKey(listNumber, selectedTaluka);
    const saved = commissionStore[currentKey];

    if (saved) {
      setEnterAmountInput(saved.enterAmount > 0 ? String(saved.enterAmount) : '');
      setPaidAmountInput(saved.paidAmount > 0 ? String(saved.paidAmount) : '');
      setPaidDateInput(saved.paidDate || '');
    } else {
      // Clean slate for new taluka
      setEnterAmountInput('');
      setPaidAmountInput('');
      setPaidDateInput('');
    }
  }, [selectedTaluka, listNumber, commissionStore]);

  // 6. Automatic Calculation: Pending Amount = Enter Amount - Paid Amount
  const calculatedPendingAmount = useMemo(() => {
    const enter = parseFloat(enterAmountInput || '0');
    const paid = parseFloat(paidAmountInput || '0');
    if (isNaN(enter) || enter <= 0) return 0;
    return Math.max(0, enter - (isNaN(paid) ? 0 : paid));
  }, [enterAmountInput, paidAmountInput]);

  // Derived Payment Status for this Taluka
  const currentPaymentStatus: AdhikariPaymentStatus = useMemo(() => {
    const enter = parseFloat(enterAmountInput || '0');
    const paid = parseFloat(paidAmountInput || '0');
    if (isNaN(enter) || enter <= 0) return 'Pending';
    if (!isNaN(paid) && paid >= enter && enter > 0) return 'Paid';
    if (!isNaN(paid) && paid > 0) return 'Partially Paid';
    return 'Pending';
  }, [enterAmountInput, paidAmountInput]);

  // 7. Save Handler for Total Taluka Commission Entry (Direct Backend API Integration)
  const handleSaveTalukaCommission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.show({ type: 'error', message: 'Access Denied: फक्त Admin वापरकर्ता अधिकारी कमिशन नोंद करू शकतो.' });
      return;
    }
    if (!selectedTaluka) {
      toast.show({ type: 'warning', message: 'कृपया तालुका निवडा.' });
      return;
    }

    const enter = parseFloat(enterAmountInput || '0');
    if (isNaN(enter) || enter < 0) {
      toast.show({ type: 'error', message: 'कृपया वैध अधिकारी कमिशन रक्कम (Enter Amount) प्रविष्ट करा.' });
      return;
    }

    const paid = parseFloat(paidAmountInput || '0');
    if (isNaN(paid) || paid < 0) {
      toast.show({ type: 'error', message: 'कृपया वैध दिलेली रक्कम (Paid Amount) प्रविष्ट करा.' });
      return;
    }

    // Strict Rule 4: "Paid Amount हा Enter Amount पेक्षा जास्त स्वीकारू नका."
    if (paid > enter) {
      toast.show({
        type: 'error',
        message: `Paid Amount (₹${paid.toLocaleString('en-IN')}) हे Enter Amount (₹${enter.toLocaleString('en-IN')}) पेक्षा जास्त असू शकत नाही.`,
      });
      return;
    }

    if (paid > 0 && !paidDateInput) {
      toast.show({ type: 'error', message: 'कृपया पैसे दिल्याची तारीख (Paid Date) निवडा.' });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/adhikari-commissions/save', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          listNumber: listNumber.trim(),
          taluka: selectedTaluka.trim(),
          totalClaimsCount: talukaClaims.length,
          enterAmount: enter,
          paidAmount: paid,
          paidDate: paidDateInput,
          createdBy: currentUser?.name || currentUser?.username || 'Admin / Operator',
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Database मध्ये सेव्ह करताना त्रुटी आली.');
      }

      const savedRecord: AdhikariTalukaCommissionRecord = result.record;
      const currentKey = getStoreKey(listNumber, selectedTaluka);
      const newStore = {
        ...commissionStore,
        [currentKey]: savedRecord,
      };

      setCommissionStore(newStore);
      setIsDbConnected(true);
      setDbError(null);

      // Keep local cache in sync
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newStore));
      } catch (_) {}

      toast.show({
        type: 'success',
        message: result.message || `यादी क्र. ${listNumber} मधील ${selectedTaluka} तालुक्याची नोंद Database मध्ये यशस्वीरीत्या सेव्ह झाली!`,
      });
    } catch (err: any) {
      console.error('Failed to save to database:', err);
      // Strict Rule 6: "API Error आल्यास योग्य Error Message दाखवा. Database Connection तुटल्यास Dummy Success दाखवू नका."
      toast.show({
        type: 'error',
        message: err?.message || 'Database त्रुटी: नोंद सेव्ह होऊ शकली नाही.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reset form to saved state from Database
  const handleResetForm = () => {
    const currentKey = getStoreKey(listNumber, selectedTaluka);
    const saved = commissionStore[currentKey];
    if (saved) {
      setEnterAmountInput(saved.enterAmount > 0 ? String(saved.enterAmount) : '');
      setPaidAmountInput(saved.paidAmount > 0 ? String(saved.paidAmount) : '');
      setPaidDateInput(saved.paidDate || '');
      toast.show({ type: 'info', message: 'नोंद Database मधील आधीच्या स्थितीत रीसेट केली.' });
    } else {
      setEnterAmountInput('');
      setPaidAmountInput('');
      setPaidDateInput('');
      toast.show({ type: 'info', message: 'फॉर्म रिकामा करण्यात आला.' });
    }
  };

  // Copy MH Number helper
  const handleCopyMh = (mh: string) => {
    if (!mh) return;
    navigator.clipboard.writeText(mh);
    setCopiedMh(mh);
    toast.show({ type: 'success', message: `MH क्रमांक कॉपी केला: ${mh}` });
    setTimeout(() => setCopiedMh(null), 2000);
  };

  // 8. Excel Export for Adhikari Commission (Taluka Claims & Commission Summary)
  const handleExportExcel = () => {
    try {
      if (talukaClaims.length === 0) {
        toast.show({ type: 'warning', message: 'या तालुक्यासाठी कोणताही क्लेम उपलब्ध नाही.' });
        return;
      }

      const wb = XLSX.utils.book_new();

      // Sheet 1: Taluka Claims Table (all individual scheme columns)
      const claimsRows = talukaClaims.map((c, idx) => {
        const fin = getClaimFinancials(c);

        return {
          '१. Serial Number (अ.क्र.)': idx + 1,
          '२. Customer Name (नाव)': c.workerName,
          '३. MH Number (क्रमांक)': c.mhNumber,
          '४. Taluka (तालुका)': c.taluka || selectedTaluka,
          '५. Verification Date (तारीख)': formatDate(c.verificationDate),
          '६. Scheme 1 Name (योजना १)': c.scheme1Name || '-',
          '७. Scheme 1 Original Amount (योजना १ मूळ रक्कम ₹)': fin.scheme1OriginalAmount,
          '८. Scheme 1 Status (योजना १ स्थिती)': fin.scheme1Status,
          '९. Scheme 1 Approved Amount (योजना १ मंजूर रक्कम ₹)': fin.scheme1ApprovedAmount,
          '१०. Scheme 2 Name (योजना २)': c.scheme2Name || '-',
          '११. Scheme 2 Original Amount (योजना २ मूळ रक्कम ₹)': fin.scheme2OriginalAmount,
          '१२. Scheme 2 Status (योजना २ स्थिती)': c.scheme2Name ? fin.scheme2Status : '-',
          '१३. Scheme 2 Approved Amount (योजना २ मंजूर रक्कम ₹)': fin.scheme2ApprovedAmount,
          '१४. Total Claim Amount (एकूण क्लेम रक्कम ₹)': fin.totalClaimAmount,
          '१५. Total Approved Amount (एकूण मंजूर रक्कम ₹)': fin.totalApprovedAmount,
          '१६. FROM (स्त्रोत)': c.fromSource || '',
        };
      });

      const wsClaims = XLSX.utils.json_to_sheet(claimsRows);
      wsClaims['!cols'] = [
        { wch: 10 }, // Sr
        { wch: 28 }, // Name
        { wch: 18 }, // MH
        { wch: 16 }, // Taluka
        { wch: 16 }, // Date
        { wch: 24 }, // S1 Name
        { wch: 18 }, // S1 Orig
        { wch: 16 }, // S1 Status
        { wch: 18 }, // S1 Appr
        { wch: 24 }, // S2 Name
        { wch: 18 }, // S2 Orig
        { wch: 16 }, // S2 Status
        { wch: 18 }, // S2 Appr
        { wch: 18 }, // Total Claim
        { wch: 18 }, // Total Approved
        { wch: 18 }, // FROM
      ];
      XLSX.utils.book_append_sheet(wb, wsClaims, `${selectedTaluka}_Claims`);

      // Sheet 2: Total Adhikari Commission Summary for this Taluka
      const summaryRows = [
        {
          'यादी क्रमांक (List Number)': listNumber,
          'तालुका (Taluka)': selectedTaluka,
          'एकूण क्लेम्स संख्या (Total Claims)': talukaClaims.length,
          'एकूण शासकीय योजना रक्कम (Total Scheme Amount ₹)': talukaTotalGovtAmount,
          'ठरवलेले अधिकारी कमिशन (Enter Amount ₹)': parseFloat(enterAmountInput || '0'),
          'प्रत्यक्ष दिलेली रक्कम (Paid Amount ₹)': parseFloat(paidAmountInput || '0'),
          'पैसे दिल्याची तारीख (Paid Date)': paidDateInput ? formatDate(paidDateInput) : '-',
          'बाकी रक्कम (Pending Amount ₹)': calculatedPendingAmount,
          'पेमेंट स्थिती (Payment Status)': currentPaymentStatus,
          'शेवटचा बदल (Last Updated)': new Date().toLocaleDateString('en-IN'),
        },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [
        { wch: 16 },
        { wch: 18 },
        { wch: 18 },
        { wch: 28 },
        { wch: 24 },
        { wch: 22 },
        { wch: 18 },
        { wch: 20 },
        { wch: 18 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Officer_Commission_Summary');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_Adhikari_Commission_List_${listNumber}_${selectedTaluka}_${today}.xlsx`);
      toast.show({
        type: 'success',
        message: `${selectedTaluka} अधिकारी कमिशन रिपोर्ट (.xlsx) डाऊनलोड झाला!`,
      });
    } catch (e) {
      console.error('Excel Export error', e);
      toast.show({ type: 'error', message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 rounded-3xl bg-white border border-rose-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-black text-slate-900">
          प्रवेश नाकारला (403 Forbidden)
        </h2>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          अधिकारी कमिशन व्यवस्थापन (Adhikari Commission Management) फक्त Admin वापरकर्त्यांसाठी उपलब्ध आहे.
        </p>
        <button
          type="button"
          onClick={onBackToLists}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition inline-flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>मागे जा (Back)</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ==================================================================== */}
      {/* HEADER & BRANDING                                                    */}
      {/* ==================================================================== */}
      <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBackToLists}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer shrink-0 mt-1"
              title="मागे यादी व्यवस्थापनाकडे जा (Back to Claim List Management)"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-3 py-1 rounded-full bg-purple-400/20 text-purple-200 text-xs font-black tracking-wide border border-purple-300/30">
                  OM DIGITAL E-SEVA KENDRA
                </span>
                <span className="px-3 py-1 rounded-xl bg-purple-600 text-white font-mono font-black text-xs">
                  यादी क्र: {listNumber}
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-bold border border-emerald-300/30 flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  Adhikari Commission Management
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                <Building2 className="w-8 h-8 text-purple-300" />
                <span>अधिकारी कमिशन व्यवस्थापन (Adhikari Commission Management)</span>
              </h1>
              <p className="text-purple-100/80 text-xs sm:text-sm mt-1 max-w-3xl font-medium">
                यादी क्र. <strong className="text-white font-bold">{listNumber}</strong> मधील तालुकानिहाय एकूण अधिकारी कमिशन नोंद (Taluka-wise Total Entry). प्रत्येक क्लेमसाठी स्वतंत्र नोंद न ठेवता संपूर्ण तालुक्यासाठी एकच एकत्रित कमिशन नोंद केली जाते.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
              title="या तालुक्याचे क्लेम व कमिशन एक्सेलमध्ये डाऊनलोड करा"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>{selectedTaluka || 'तालुका'} एक्सेल (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={onBackToLists}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20 cursor-pointer"
            >
              मागे जा (Back)
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. TALUKA DROPDOWN SELECTION BAR                                     */}
      {/* ==================================================================== */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 border border-purple-200 text-purple-900 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-purple-800" />
          </div>
          <div>
            <label htmlFor="taluka-dropdown-select" className="text-xs font-black text-slate-800 uppercase tracking-wider block">
              १. तालुका निवडा (Select Taluka) *
            </label>
            <p className="text-xs text-slate-500 font-medium">
              यादी क्र. <strong className="font-bold text-purple-950">{listNumber}</strong> मधील उपलब्ध तालुके
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-60">
            <select
              id="taluka-dropdown-select"
              value={selectedTaluka}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border-2 border-purple-300 font-black text-sm text-purple-950 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 transition cursor-pointer shadow-xs"
            >
              {availableTalukas.map((t) => {
                const count = listClaims.filter((c) => (c.taluka || '').trim().toLowerCase() === t.toLowerCase()).length;
                return (
                  <option key={t} value={t}>
                    तालुका: {t} ({count} क्लेम्स)
                  </option>
                );
              })}
            </select>
          </div>

          <div className="w-full sm:w-56">
            <FromSourceFilterSelect
              value={fromSourceFilter}
              onChange={(val) => setFromSourceFilter(val)}
              label="२. FROM (स्त्रोत)"
              id="adhikari-from-source-filter"
            />
          </div>

          <span className="text-xs font-mono font-bold text-purple-900 bg-purple-50 px-3 py-2 rounded-xl border border-purple-200 shrink-0 self-center">
            {talukaClaims.length} क्लेम उपलब्ध
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. TALUKA-WISE CLAIMS TABLE (STRICT: 7 EXACT COLUMNS, NO INPUTS)    */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-800" />
            <div>
              <h2 className="text-base font-black text-slate-900">
                {selectedTaluka} तालुक्यातील क्लेम्स यादी (Claims in {selectedTaluka})
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                नियम: या Table मध्ये प्रत्येक Claim समोर कोणतेही Input किंवा Payment Date field नाही; केवळ कामगारांची माहिती दाखवली आहे.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
              एकूण: {talukaClaims.length} क्लेम
            </span>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-xl font-mono">
              मदत: ₹{talukaTotalGovtAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* 7 Columns Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-inner">
          <table className="w-full text-left text-xs border-collapse min-w-[850px]">
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 w-14 text-center">१. Serial Number</th>
                <th className="py-3 px-4">२. Customer Name</th>
                <th className="py-3 px-3">३. MH Number</th>
                <th className="py-3 px-3 text-center">४. Taluka</th>
                <th className="py-3 px-3 text-center">५. Verification Date</th>
                <th className="py-3 px-4">६. Scheme Name</th>
                <th className="py-3 px-3 text-right">७. Scheme Amount</th>
                <th className="py-3 px-3">८. FROM (स्त्रोत)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white font-medium">
              {talukaClaims.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Building2 className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-600">
                      {selectedTaluka} तालुक्यामध्ये कोणताही क्लेम सापडला नाही.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      कृपया वरील ड्रॉपडाऊनमधून दुसरा तालुका निवडा.
                    </p>
                  </td>
                </tr>
              ) : (
                talukaClaims.map((claim, idx) => {
                  const fin = getClaimFinancials(claim);
                  const s1Name = claim.scheme1Name || '-';
                  const s1Amt = fin.scheme1OriginalAmount;
                  const s2Name = claim.scheme2Name || '';
                  const s2Amt = fin.scheme2OriginalAmount;
                  const totalApprovedAmt = fin.totalApprovedAmount;
                  const totalOriginalAmt = fin.totalClaimAmount;

                  return (
                    <tr key={claim.id} className="hover:bg-purple-50/40 transition group">
                      {/* 1. Serial Number */}
                      <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold">
                        {idx + 1}
                      </td>

                      {/* 2. Customer Name */}
                      <td className="py-3 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-800 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {claim.workerName?.charAt(0) || 'W'}
                          </span>
                          <div>
                            <span>{claim.workerName}</span>
                            {claim.mobileNumber && (
                              <span className="text-[10px] text-slate-400 block font-normal font-mono">
                                {claim.mobileNumber}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. MH Number */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-purple-950 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            {claim.mhNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyMh(claim.mhNumber)}
                            className="p-1 text-slate-400 hover:text-purple-700 transition cursor-pointer"
                            title="कॉपी करा"
                          >
                            {copiedMh === claim.mhNumber ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 4. Taluka */}
                      <td className="py-3 px-3 text-center font-bold text-slate-800">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-xs">
                          {claim.taluka || selectedTaluka}
                        </span>
                      </td>

                      {/* 5. Verification Date */}
                      <td className="py-3 px-3 text-center font-mono text-slate-600 text-xs">
                        {claim.verificationDate ? formatDate(claim.verificationDate) : '-'}
                      </td>

                      {/* 6. Scheme Name */}
                      <td className="py-3 px-4 text-slate-700">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800">{s1Name}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              fin.scheme1Status === 'Approved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : fin.scheme1Status === 'Review Required'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}>
                              {fin.scheme1Status === 'Approved' ? '● मंजूर' : fin.scheme1Status === 'Review Required' ? '● पडताळणी बाकी' : '● नामंजूर (₹0)'}
                            </span>
                          </div>
                          {s2Name && (
                            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-600 font-medium">
                              <span>+ {s2Name}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                fin.scheme2Status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : fin.scheme2Status === 'Review Required'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}>
                                {fin.scheme2Status === 'Approved' ? '● मंजूर' : fin.scheme2Status === 'Review Required' ? '● पडताळणी बाकी' : '● नामंजूर (₹0)'}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 7. Scheme Amount */}
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-sm">
                        ₹{totalApprovedAmt.toLocaleString('en-IN')}
                        {totalApprovedAmt !== totalOriginalAmt && (
                          <span className="text-[10px] text-slate-400 block font-normal line-through">
                            मूळ: ₹{totalOriginalAmt.toLocaleString('en-IN')}
                          </span>
                        )}
                        {s2Amt > 0 && (
                          <span className="text-[10px] text-slate-500 block font-normal">
                            (₹{fin.scheme1ApprovedAmount.toLocaleString('en-IN')} + ₹{fin.scheme2ApprovedAmount.toLocaleString('en-IN')})
                          </span>
                        )}
                      </td>

                      {/* 8. FROM */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {claim.fromSource ? (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-xs border border-purple-200 inline-block">
                            {claim.fromSource}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. TOTAL ADHIKARI COMMISSION ENTRY (FOR ENTIRE TALUKA AT ONCE)       */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border-2 border-purple-200 shadow-xl p-6 sm:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-black text-slate-900">
                  संपूर्ण {selectedTaluka} तालुक्यासाठी अधिकारी कमिशन नोंद (Total Entry)
                </h3>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                    currentPaymentStatus === 'Paid'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : currentPaymentStatus === 'Partially Paid'
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  {currentPaymentStatus === 'Paid'
                    ? '● PAID (पूर्ण जमा)'
                    : currentPaymentStatus === 'Partially Paid'
                    ? '● PARTIAL (अंशता)'
                    : '● PENDING (बाकी)'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                नियम: एका List Number मधील निवडलेल्या Taluka च्या सर्व Claims साठी एकच Total Adhikari Commission Entry.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs flex-wrap">
            <div className="px-3 py-1.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 font-medium">
              यादी क्र: <strong className="font-bold">{listNumber}</strong> | तालुका: <strong className="font-bold">{selectedTaluka}</strong>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold bg-slate-50 border-slate-200">
              <Database className="w-3.5 h-3.5 text-purple-700" />
              {isLoading ? (
                <span className="text-slate-500 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin text-purple-600" />
                  Database Sync...
                </span>
              ) : isDbConnected ? (
                <span className="text-emerald-700 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Database Connected
                </span>
              ) : (
                <span className="text-amber-700">Offline Cache</span>
              )}
            </div>

            <button
              type="button"
              onClick={fetchDatabaseRecords}
              disabled={isLoading}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-800 transition cursor-pointer"
              title="Database मधून ताजी माहिती पुन्हा लोड करा"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Taluka Rollup Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              तालुक्यातील एकूण कामगार
            </span>
            <span className="font-mono font-black text-slate-900 text-lg sm:text-xl mt-1 block">
              {talukaClaims.length} ग्राहक
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              एकूण शासकीय मदत रक्कम
            </span>
            <span className="font-mono font-black text-emerald-800 text-lg sm:text-xl mt-1 block">
              ₹{talukaTotalGovtAmount.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <span className="text-[10px] text-purple-800 font-bold uppercase tracking-wider block">
              ठरवलेले अधिकारी कमिशन
            </span>
            <span className="font-mono font-black text-purple-950 text-lg sm:text-xl mt-1 block">
              ₹{(parseFloat(enterAmountInput || '0') || 0).toLocaleString('en-IN')}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider block">
              बाकी रक्कम (Pending)
            </span>
            <span className="font-mono font-black text-amber-950 text-lg sm:text-xl mt-1 block">
              ₹{calculatedPendingAmount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* The Exact 4 Fields Form Specified by User */}
        <form onSubmit={handleSaveTalukaCommission} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Field 1: Enter Amount */}
            <div>
              <label htmlFor="enter-adhikari-amount-input" className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <IndianRupee className="w-3.5 h-3.5 text-purple-700" />
                <span>१. Enter Amount (एकूण कमिशन ₹) *</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">₹</span>
                <input
                  id="enter-adhikari-amount-input"
                  type="number"
                  value={enterAmountInput}
                  onChange={(e) => setEnterAmountInput(e.target.value)}
                  placeholder="उदा. 25000"
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 font-mono font-black text-sm text-slate-900 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 transition"
                  required
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block font-medium">
                संपूर्ण {selectedTaluka} साठी अधिकारी कमिशनची एकूण रक्कम Manually Enter करा.
              </span>
            </div>

            {/* Field 2: Paid Amount */}
            <div>
              <label htmlFor="paid-adhikari-amount-input" className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>२. Paid Amount (प्रत्यक्ष दिलेली रक्कम ₹) *</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">₹</span>
                <input
                  id="paid-adhikari-amount-input"
                  type="number"
                  value={paidAmountInput}
                  onChange={(e) => setPaidAmountInput(e.target.value)}
                  placeholder="उदा. 15000"
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-50 border border-emerald-300 font-mono font-black text-sm text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200 transition"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block font-medium">
                प्रत्यक्ष दिलेली रक्कम Manually Enter करा (रक्कम दिली नसल्यास ० ठेवा).
              </span>
            </div>

            {/* Field 3: Paid Date (Custom) */}
            <div>
              <label htmlFor="paid-adhikari-date-input" className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-700" />
                <span>३. Paid Date (पैसे दिल्याची तारीख)</span>
              </label>
              <input
                id="paid-adhikari-date-input"
                type="date"
                value={paidDateInput}
                onChange={(e) => setPaidDateInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 font-medium text-xs text-slate-900 focus:bg-white focus:border-purple-600 focus:ring-2 focus:ring-purple-200 transition cursor-pointer"
              />
              <span className="text-[10px] text-slate-400 mt-1 block font-medium">
                पैसे दिल्याची तारीख निवडण्यासाठी Date Picker.
              </span>
            </div>

            {/* Field 4: Pending Amount (Formula: Enter Amount - Paid Amount) */}
            <div>
              <label className="text-xs font-black text-amber-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>४. Pending Amount (बाकी रक्कम ₹)</span>
              </label>
              <div className="w-full px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900">स्वयंचलित:</span>
                <span className="font-mono font-black text-base text-amber-950">
                  ₹{calculatedPendingAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <span className="text-[10px] text-amber-800 mt-1 block font-semibold">
                Formula: Enter Amount − Paid Amount नुसार आपोआप मोजले जाते.
              </span>
            </div>
          </div>

          {/* Action Buttons: Save & Reset */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer w-full sm:w-auto justify-center"
            >
              <RotateCcw className="w-4 h-4" />
              <span>रीसेट करा (Reset)</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 text-white font-black text-xs sm:text-sm shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Database मध्ये जतन होत आहे...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{selectedTaluka} कमिशन नोंद Database मध्ये सेव्ह करा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Database Saved Entry Details Card (Direct verification of mapped columns) */}
        {currentSavedRecord && (
          <div className="mt-6 pt-5 border-t-2 border-purple-100 bg-gradient-to-br from-purple-50/70 via-indigo-50/40 to-slate-50 p-5 rounded-2xl border border-purple-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>Database मध्ये जतन केलेली अधिकृत नोंद (Saved Record)</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                      ✓ Active in Database
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    ही नोंद Database (TiDB / MySQL) मध्ये कायमस्वरूपी सेव्ह असून Page Refresh नंतरही उपलब्ध राहते.
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                    currentSavedRecord.paymentStatus === 'Paid'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : currentSavedRecord.paymentStatus === 'Partially Paid'
                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}
                >
                  {currentSavedRecord.paymentStatus === 'Paid'
                    ? '● PAID (पूर्ण जमा)'
                    : currentSavedRecord.paymentStatus === 'Partially Paid'
                    ? '● PARTIALLY PAID (अंशता)'
                    : '● PENDING (बाकी)'}
                </span>
              </div>
            </div>

            {/* All 10 Database Mapped Fields Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              {/* 1. List Number */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">१. List Number</span>
                <span className="font-mono font-black text-purple-900 text-sm mt-0.5 block">
                  {currentSavedRecord.listNumber}
                </span>
              </div>

              {/* 2. Taluka */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">२. Taluka (तालुका)</span>
                <span className="font-black text-slate-900 text-sm mt-0.5 block">
                  {currentSavedRecord.taluka}
                </span>
              </div>

              {/* 3. Total Claims Count */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">३. Total Claims Count</span>
                <span className="font-mono font-black text-slate-900 text-sm mt-0.5 block">
                  {currentSavedRecord.totalClaimsCount || talukaClaims.length} Claims
                </span>
              </div>

              {/* 4. Enter Amount */}
              <div className="p-3 rounded-xl bg-purple-50/80 border border-purple-200">
                <span className="text-[10px] text-purple-800 font-bold uppercase block">४. Enter Amount (एकूण)</span>
                <span className="font-mono font-black text-purple-950 text-base mt-0.5 block">
                  ₹{currentSavedRecord.enterAmount.toLocaleString('en-IN')}
                </span>
              </div>

              {/* 5. Paid Amount */}
              <div className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200">
                <span className="text-[10px] text-emerald-800 font-bold uppercase block">५. Paid Amount (दिलेली)</span>
                <span className="font-mono font-black text-emerald-950 text-base mt-0.5 block">
                  ₹{currentSavedRecord.paidAmount.toLocaleString('en-IN')}
                </span>
              </div>

              {/* 6. Paid Date */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">६. Paid Date (तारीख)</span>
                <span className="font-mono font-bold text-slate-800 text-xs mt-0.5 block">
                  {currentSavedRecord.paidDate ? formatDate(currentSavedRecord.paidDate) : '-'}
                </span>
              </div>

              {/* 7. Pending Amount */}
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200">
                <span className="text-[10px] text-amber-800 font-bold uppercase block">७. Pending Amount (बाकी)</span>
                <span className="font-mono font-black text-amber-950 text-base mt-0.5 block">
                  ₹{currentSavedRecord.pendingAmount.toLocaleString('en-IN')}
                </span>
              </div>

              {/* 8. Created By */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">८. Created By (नोंदणीकर्ता)</span>
                <span className="font-bold text-slate-800 text-xs mt-0.5 block truncate" title={currentSavedRecord.createdBy}>
                  {currentSavedRecord.createdBy || 'Admin / Operator'}
                </span>
              </div>

              {/* 9. Created Date */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">९. Created Date</span>
                <span className="font-mono text-slate-600 text-[11px] mt-0.5 block">
                  {currentSavedRecord.createdAt ? formatDate(currentSavedRecord.createdAt) : '-'}
                </span>
              </div>

              {/* 10. Updated Date */}
              <div className="p-3 rounded-xl bg-white border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">१०. Updated Date</span>
                <span className="font-mono text-slate-600 text-[11px] mt-0.5 block truncate" title={currentSavedRecord.updatedAt}>
                  {currentSavedRecord.updatedAt ? new Date(currentSavedRecord.updatedAt).toLocaleDateString('mr-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

