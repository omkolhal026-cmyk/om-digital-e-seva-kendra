import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Boxes,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Download,
  Filter,
  RefreshCw,
  AlertTriangle,
  User as UserIcon,
  Phone,
  MapPin,
  Shield,
  FileSpreadsheet,
  Undo2,
  Info,
  Gift,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  MoveHorizontal,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { MaterialDistributionRecord, MaterialStatus, User } from '../types';

interface MaterialDistributionModuleProps {
  currentUser: User;
  onRefreshData?: () => void;
}

type TabType = 'bhandi_pending' | 'peti_pending' | 'bag_pending' | 'given' | 'not_eligible' | 'all';

// Slide Switch Button Component for Material Status
interface SlideSwitchProps {
  status: MaterialStatus;
  disabled?: boolean;
  onToggle: (newStatus: 'Pending' | 'Given') => void;
  labelPending?: string;
  labelGiven?: string;
}

const SlideSwitch: React.FC<SlideSwitchProps> = ({
  status,
  disabled = false,
  onToggle,
  labelPending = 'Pending',
  labelGiven = 'Given',
}) => {
  const isGiven = status === 'Given';
  const isNotEligible = status === 'Not Eligible';

  if (isNotEligible) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
        <XCircle className="w-3 h-3 text-rose-600" />
        Not Eligible
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5" title="Slide Button: Click or slide to change status">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(isGiven ? 'Pending' : 'Given')}
        className={`relative inline-flex items-center h-6 rounded-full w-12 transition-colors duration-300 focus:outline-none cursor-pointer p-0.5 shadow-inner ${
          isGiven ? 'bg-emerald-600' : 'bg-amber-400 hover:bg-amber-500'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ease-in-out font-bold text-[10px] ${
            isGiven ? 'translate-x-6 text-emerald-700' : 'translate-x-0 text-amber-700'
          }`}
        >
          {isGiven ? '✓' : '•'}
        </span>
      </button>
      <span className={`text-[10px] font-bold ${isGiven ? 'text-emerald-700' : 'text-amber-800'}`}>
        {isGiven ? labelGiven : labelPending}
      </span>
    </div>
  );
};

export const MaterialDistributionModule: React.FC<MaterialDistributionModuleProps> = ({
  currentUser,
}) => {
  const [records, setRecords] = useState<MaterialDistributionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Table container ref for horizontal data sliding
  const tableRef = useRef<HTMLDivElement>(null);
  const [slideProgress, setSlideProgress] = useState<number>(0);

  const scrollData = (offset: number) => {
    if (tableRef.current) {
      tableRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const handleTableScroll = () => {
    if (tableRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tableRef.current;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll > 0) {
        setSlideProgress(Math.round((scrollLeft / maxScroll) * 100));
      } else {
        setSlideProgress(0);
      }
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSlideProgress(val);
    if (tableRef.current) {
      const { scrollWidth, clientWidth } = tableRef.current;
      const maxScroll = scrollWidth - clientWidth;
      tableRef.current.scrollLeft = (val / 100) * maxScroll;
    }
  };

  // Active filter tab
  const [activeTab, setActiveTab] = useState<TabType>('bhandi_pending');

  // Search and Filter fields
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTaluka, setSelectedTaluka] = useState<string>('');
  const [selectedSourceType, setSelectedSourceType] = useState<string>(''); // '' | 'Registration' | 'Renewal'

  // Modal State for Mark Not Eligible
  const [notEligibleModalItem, setNotEligibleModalItem] = useState<{
    record: MaterialDistributionRecord;
    materialType: 'bhandi' | 'peti' | 'bag' | 'all';
  } | null>(null);

  const [notEligibleReason, setNotEligibleReason] = useState<string>('Not eligible for material');
  const [customRemark, setCustomRemark] = useState<string>('');
  const [updatedBy, setUpdatedBy] = useState<string>(currentUser.name || currentUser.username || 'Staff');
  const [updatedDate, setUpdatedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch material distribution records from server
  const fetchRecords = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/material-distributions', {
        headers: {
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch material distribution data');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error loading material distribution data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  // Calculate pending counts
  const bhandiPendingCount = useMemo(
    () => records.filter((r) => r.bhandiStatus === 'Pending').length,
    [records]
  );
  const petiPendingCount = useMemo(
    () => records.filter((r) => r.petiStatus === 'Pending').length,
    [records]
  );
  const bagPendingCount = useMemo(
    () => records.filter((r) => r.bagStatus === 'Pending').length,
    [records]
  );
  const givenCount = useMemo(
    () =>
      records.filter(
        (r) =>
          r.bhandiStatus === 'Given' ||
          r.petiStatus === 'Given' ||
          r.bagStatus === 'Given'
      ).length,
    [records]
  );
  const notEligibleCount = useMemo(
    () =>
      records.filter(
        (r) =>
          r.bhandiStatus === 'Not Eligible' ||
          r.petiStatus === 'Not Eligible' ||
          r.bagStatus === 'Not Eligible'
      ).length,
    [records]
  );

  // Unique Talukas for dropdown
  const uniqueTalukas = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.taluka) set.add(r.taluka.trim());
    });
    return Array.from(set).sort();
  }, [records]);

  // Filter records based on active tab and search criteria
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. Tab level filter
      if (activeTab === 'bhandi_pending') {
        if (r.bhandiStatus !== 'Pending') return false;
      } else if (activeTab === 'peti_pending') {
        if (r.petiStatus !== 'Pending') return false;
      } else if (activeTab === 'bag_pending') {
        if (r.bagStatus !== 'Pending') return false;
      } else if (activeTab === 'given') {
        if (
          r.bhandiStatus !== 'Given' &&
          r.petiStatus !== 'Given' &&
          r.bagStatus !== 'Given'
        )
          return false;
      } else if (activeTab === 'not_eligible') {
        if (
          r.bhandiStatus !== 'Not Eligible' &&
          r.petiStatus !== 'Not Eligible' &&
          r.bagStatus !== 'Not Eligible'
        )
          return false;
      }

      // 2. Taluka filter
      if (selectedTaluka && r.taluka !== selectedTaluka) {
        return false;
      }

      // 2b. Source Type filter (New / Renewal)
      if (selectedSourceType && r.sourceType !== selectedSourceType) {
        return false;
      }

      // 3. Search query filter (Name, MH Number, Mobile)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = r.workerName.toLowerCase().includes(q);
        const matchesMH = r.mhNumber.toLowerCase().includes(q);
        const matchesMobile = r.mobileNumber.toLowerCase().includes(q);
        const matchesTaluka = r.taluka.toLowerCase().includes(q);

        if (!matchesName && !matchesMH && !matchesMobile && !matchesTaluka) {
          return false;
        }
      }

      return true;
    });
  }, [records, activeTab, selectedTaluka, selectedSourceType, searchQuery]);

  // Handle Mark as Given
  const handleMarkAsGiven = async (
    record: MaterialDistributionRecord,
    materialType: 'bhandi' | 'peti' | 'bag'
  ) => {
    const previousRecords = [...records];
    const todayStr = new Date().toISOString().split('T')[0];
    const updaterName = currentUser.name || currentUser.username || 'Staff';

    // Optimistic UI update
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== record.id) return r;
        return {
          ...r,
          [`${materialType}Status`]: 'Given',
          [`${materialType}GivenDate`]: todayStr,
          [`${materialType}GivenBy`]: updaterName,
          [`${materialType}NotEligibleReason`]: undefined,
        };
      })
    );

    try {
      setErrorMsg('');
      const res = await fetch(`/api/material-distributions/${record.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          materialType,
          newStatus: 'Given',
          updatedBy: updaterName,
          updatedDate: todayStr,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || 'Failed to update material status');
      }

      const updatedRecord: MaterialDistributionRecord = await res.json();
      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) =>
          prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
        );
      }

      const materialNameMap = {
        bhandi: 'भांडी',
        peti: 'पेटी',
        bag: 'बॅग',
      };

      setSuccessMsg(
        `Successfully marked ${materialNameMap[materialType]} as GIVEN for ${record.workerName}`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setRecords(previousRecords);
      setErrorMsg(err?.message || 'Error marking material as Given');
    }
  };

  // Open Not Eligible Modal
  const openNotEligibleModal = (
    record: MaterialDistributionRecord,
    materialType: 'bhandi' | 'peti' | 'bag' | 'all'
  ) => {
    setNotEligibleModalItem({ record, materialType });
    setNotEligibleReason('Not eligible for material');
    setCustomRemark('');
    setUpdatedBy(currentUser.name || currentUser.username || 'Staff');
    setUpdatedDate(new Date().toISOString().split('T')[0]);
  };

  // Submit Mark Not Eligible
  const handleConfirmNotEligible = async () => {
    if (!notEligibleModalItem) return;

    if (notEligibleReason === 'Other' && !customRemark.trim()) {
      setErrorMsg('Please enter a remark when selecting "Other" as the reason.');
      return;
    }

    const finalReason =
      notEligibleReason === 'Other'
        ? `Other: ${customRemark.trim()}`
        : notEligibleReason;

    const targetRecord = notEligibleModalItem.record;
    const matType = notEligibleModalItem.materialType;
    const previousRecords = [...records];

    // Optimistic UI update
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== targetRecord.id) return r;
        const updated = { ...r };
        if (matType === 'all' || matType === 'bhandi') {
          updated.bhandiStatus = 'Not Eligible';
          updated.bhandiNotEligibleReason = finalReason;
        }
        if (matType === 'all' || matType === 'peti') {
          updated.petiStatus = 'Not Eligible';
          updated.petiNotEligibleReason = finalReason;
        }
        if (matType === 'all' || matType === 'bag') {
          updated.bagStatus = 'Not Eligible';
          updated.bagNotEligibleReason = finalReason;
        }
        return updated;
      })
    );

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const res = await fetch(
        `/api/material-distributions/${targetRecord.id}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-username': currentUser.username,
            'x-user-role': currentUser.role,
          },
          body: JSON.stringify({
            materialType: matType,
            newStatus: 'Not Eligible',
            updatedBy,
            updatedDate,
            reason: finalReason,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || 'Failed to update eligibility status');
      }

      const updatedRecord: MaterialDistributionRecord = await res.json();
      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) =>
          prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
        );
      }

      setSuccessMsg(
        `Worker ${targetRecord.workerName} marked as NOT ELIGIBLE.`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
      setNotEligibleModalItem(null);
    } catch (err: any) {
      setRecords(previousRecords);
      setErrorMsg(err?.message || 'Error updating eligibility status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin Revert Not Eligible -> Pending
  const handleRevertToPending = async (
    record: MaterialDistributionRecord,
    materialType: 'bhandi' | 'peti' | 'bag' | 'all'
  ) => {
    if (currentUser.role !== 'admin') {
      setErrorMsg('Only Admin can revert status back to Pending.');
      return;
    }

    const previousRecords = [...records];

    // Optimistic UI update
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== record.id) return r;
        const updated = { ...r };
        if (materialType === 'all' || materialType === 'bhandi') {
          updated.bhandiStatus = 'Pending';
          updated.bhandiGivenDate = undefined;
          updated.bhandiGivenBy = undefined;
          updated.bhandiNotEligibleReason = undefined;
        }
        if (materialType === 'all' || materialType === 'peti') {
          updated.petiStatus = 'Pending';
          updated.petiGivenDate = undefined;
          updated.petiGivenBy = undefined;
          updated.petiNotEligibleReason = undefined;
        }
        if (materialType === 'all' || materialType === 'bag') {
          updated.bagStatus = 'Pending';
          updated.bagGivenDate = undefined;
          updated.bagGivenBy = undefined;
          updated.bagNotEligibleReason = undefined;
        }
        return updated;
      })
    );

    try {
      setErrorMsg('');
      const res = await fetch(`/api/material-distributions/${record.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          materialType,
          newStatus: 'Pending',
          updatedBy: currentUser.name || currentUser.username,
          updatedDate: new Date().toISOString().split('T')[0],
          reason: 'Reverted back to Pending by Admin',
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || 'Failed to revert status');
      }

      const updatedRecord: MaterialDistributionRecord = await res.json();
      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) =>
          prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
        );
      }

      setSuccessMsg(
        `Reverted material status back to PENDING for ${record.workerName}`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setRecords(previousRecords);
      setErrorMsg(err?.message || 'Error reverting status to Pending');
    }
  };

  // FEATURE 14: Export Currently Filtered Records to Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      setErrorMsg('No records match the current filters to export.');
      return;
    }

    const getGivenDateStr = (r: MaterialDistributionRecord) => {
      if (activeTab === 'bhandi_pending') return r.bhandiGivenDate || '-';
      if (activeTab === 'peti_pending') return r.petiGivenDate || '-';
      if (activeTab === 'bag_pending') return r.bagGivenDate || '-';
      
      const parts: string[] = [];
      if (r.bhandiGivenDate) parts.push(`भांडी: ${r.bhandiGivenDate}`);
      if (r.petiGivenDate) parts.push(`पेटी: ${r.petiGivenDate}`);
      if (r.bagGivenDate) parts.push(`बॅग: ${r.bagGivenDate}`);
      return parts.length > 0 ? parts.join(' | ') : '-';
    };

    const getGivenByStr = (r: MaterialDistributionRecord) => {
      if (activeTab === 'bhandi_pending') return r.bhandiGivenBy || '-';
      if (activeTab === 'peti_pending') return r.petiGivenBy || '-';
      if (activeTab === 'bag_pending') return r.bagGivenBy || '-';

      const parts: string[] = [];
      if (r.bhandiGivenBy) parts.push(`भांडी: ${r.bhandiGivenBy}`);
      if (r.petiGivenBy) parts.push(`पेटी: ${r.petiGivenBy}`);
      if (r.bagGivenBy) parts.push(`बॅग: ${r.bagGivenBy}`);
      return parts.length > 0 ? parts.join(' | ') : '-';
    };

    const excelData = filteredRecords.map((r) => ({
      'Full Name': r.workerName,
      'MH Number': r.mhNumber,
      'Mobile Number': r.mobileNumber,
      'Taluka': r.taluka || '-',
      'भांडी Status': r.bhandiStatus,
      'पेटी Status': r.petiStatus,
      'बॅग Status': r.bagStatus,
      'Given Date': getGivenDateStr(r),
      'Given By': getGivenByStr(r),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();

    const sheetTitleMap: Record<TabType, string> = {
      bhandi_pending: 'Bhandi_Pending',
      peti_pending: 'Peti_Pending',
      bag_pending: 'Bag_Pending',
      given: 'Given_List',
      not_eligible: 'Not_Eligible',
      all: 'Material_Distribution_All',
    };

    const sheetName = sheetTitleMap[activeTab] || 'Material_Distribution';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(
      workbook,
      `Material_Distribution_${sheetName}_${dateStr}.xlsx`
    );
  };

  const getStatusBadge = (status: MaterialStatus) => {
    switch (status) {
      case 'Given':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Given
          </span>
        );
      case 'Not Eligible':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Not Eligible
          </span>
        );
      case 'Pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-800 via-emerald-800 to-indigo-900 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <Boxes className="w-7 h-7 text-teal-200" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Material Distribution Module
              </h1>
              <p className="text-xs text-teal-100 mt-1">
                Active Workers Equipment Distribution (भांडी, पेटी, बॅग) • Only Active Workers with valid MH numbers • Data Slide & Excel Exports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              title="Export filtered records to Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              Export Excel ({filteredRecords.length})
            </button>
            <button
              onClick={fetchRecords}
              disabled={loading}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all border border-white/20 cursor-pointer disabled:opacity-50"
              title="Refresh Material Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg('')}
            className="text-rose-500 hover:text-rose-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg('')}
            className="text-emerald-500 hover:text-emerald-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* FEATURE 11: Material-Wise Pending Tabs & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            onClick={() => setActiveTab('bhandi_pending')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'bhandi_pending'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>भांडी Pending</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'bhandi_pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800'
              }`}
            >
              {bhandiPendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('peti_pending')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'peti_pending'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>पेटी Pending</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'peti_pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800'
              }`}
            >
              {petiPendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bag_pending')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'bag_pending'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>बॅग Pending</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'bag_pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800'
              }`}
            >
              {bagPendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('given')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'given'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Given List</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'given'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {givenCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('not_eligible')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'not_eligible'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span>Not Eligible List</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'not_eligible'
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {notEligibleCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>All Records ({records.length})</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Name, MH Number, Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>

          <div>
            <select
              value={selectedTaluka}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none cursor-pointer"
            >
              <option value="">All Talukas</option>
              {uniqueTalukas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none cursor-pointer font-medium text-slate-700"
            >
              <option value="">All Types (New & Renewal)</option>
              <option value="Registration">New / नवीन नोंदणी</option>
              <option value="Renewal">Renewal / नूतनीकरण</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Showing <strong className="text-slate-800">{filteredRecords.length}</strong> records
            </span>
            {(searchQuery || selectedTaluka || selectedSourceType) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTaluka('');
                  setSelectedSourceType('');
                }}
                className="text-teal-600 hover:text-teal-800 text-xs font-semibold underline cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Records Table Container with Data Slide controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
        {/* Data Slide Controls Bar */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <SlidersHorizontal className="w-4 h-4 text-teal-600" />
            <span>Data Slide Control (डेटा स्लाईड करा)</span>
          </div>

          <div className="flex items-center gap-3 flex-1 max-w-xs md:max-w-md">
            <button
              type="button"
              onClick={() => scrollData(-250)}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 text-[11px]"
              title="Slide Data Left"
            >
              <ChevronLeft className="w-4 h-4 text-teal-600" />
              <span>Slide Left</span>
            </button>

            <div className="flex-1 flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                value={slideProgress}
                onChange={handleSliderChange}
                className="w-full accent-teal-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                title="Drag to slide table data horizontally"
              />
              <span className="text-[10px] font-mono text-slate-500 font-bold w-8 text-right">
                {slideProgress}%
              </span>
            </div>

            <button
              type="button"
              onClick={() => scrollData(250)}
              className="p-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-slate-700 font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 text-[11px]"
              title="Slide Data Right"
            >
              <span>Slide Right</span>
              <ChevronRight className="w-4 h-4 text-teal-600" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 text-teal-600 animate-spin" />
            <p className="text-xs font-semibold">Loading Material Distribution records...</p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No Records Found</p>
            <p className="text-xs text-slate-400">
              {searchQuery || selectedTaluka
                ? 'Try adjusting your search criteria or filters.'
                : 'No workers matching the selected material category status.'}
            </p>
          </div>
        ) : (
          <div
            ref={tableRef}
            onScroll={handleTableScroll}
            className="overflow-x-auto scrollbar-thin scrollbar-thumb-teal-300"
          >
            <table className="w-full text-left text-xs border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Worker Name</th>
                  <th className="py-3.5 px-4">MH Number</th>
                  <th className="py-3.5 px-4">Mobile</th>
                  <th className="py-3.5 px-4">Taluka</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4 text-center">भांडी</th>
                  <th className="py-3.5 px-4 text-center">पेटी</th>
                  <th className="py-3.5 px-4 text-center">बॅग</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {r.workerName}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-teal-700">
                      {r.mhNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{r.mobileNumber || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600">{r.taluka || '-'}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          r.sourceType === 'Registration'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {r.sourceType === 'Registration' ? 'New (नवीन)' : 'Renewal (नूतनीकरण)'}
                      </span>
                    </td>

                    {/* भांडी Status */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SlideSwitch
                          status={r.bhandiStatus}
                          disabled={isSubmitting}
                          onToggle={(newStatus) => {
                            if (newStatus === 'Given') {
                              handleMarkAsGiven(r, 'bhandi');
                            } else if (currentUser.role === 'admin') {
                              handleRevertToPending(r, 'bhandi');
                            } else {
                              setErrorMsg('Only Admin can revert Given status back to Pending.');
                            }
                          }}
                        />
                        {r.bhandiGivenDate && (
                          <span className="text-[10px] text-slate-400">
                            {r.bhandiGivenDate}
                          </span>
                        )}
                        {r.bhandiNotEligibleReason && (
                          <span className="text-[10px] text-rose-500 font-medium max-w-[120px] truncate" title={r.bhandiNotEligibleReason}>
                            {r.bhandiNotEligibleReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* पेटी Status */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SlideSwitch
                          status={r.petiStatus}
                          disabled={isSubmitting}
                          onToggle={(newStatus) => {
                            if (newStatus === 'Given') {
                              handleMarkAsGiven(r, 'peti');
                            } else if (currentUser.role === 'admin') {
                              handleRevertToPending(r, 'peti');
                            } else {
                              setErrorMsg('Only Admin can revert Given status back to Pending.');
                            }
                          }}
                        />
                        {r.petiGivenDate && (
                          <span className="text-[10px] text-slate-400">
                            {r.petiGivenDate}
                          </span>
                        )}
                        {r.petiNotEligibleReason && (
                          <span className="text-[10px] text-rose-500 font-medium max-w-[120px] truncate" title={r.petiNotEligibleReason}>
                            {r.petiNotEligibleReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* बॅग Status */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SlideSwitch
                          status={r.bagStatus}
                          disabled={isSubmitting}
                          onToggle={(newStatus) => {
                            if (newStatus === 'Given') {
                              handleMarkAsGiven(r, 'bag');
                            } else if (currentUser.role === 'admin') {
                              handleRevertToPending(r, 'bag');
                            } else {
                              setErrorMsg('Only Admin can revert Given status back to Pending.');
                            }
                          }}
                        />
                        {r.bagGivenDate && (
                          <span className="text-[10px] text-slate-400">
                            {r.bagGivenDate}
                          </span>
                        )}
                        {r.bagNotEligibleReason && (
                          <span className="text-[10px] text-rose-500 font-medium max-w-[120px] truncate" title={r.bagNotEligibleReason}>
                            {r.bagNotEligibleReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* If viewing Bhandi Pending tab */}
                        {activeTab === 'bhandi_pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsGiven(r, 'bhandi')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Given
                            </button>
                            <button
                              onClick={() => openNotEligibleModal(r, 'bhandi')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Not Eligible
                            </button>
                          </>
                        )}

                        {/* If viewing Peti Pending tab */}
                        {activeTab === 'peti_pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsGiven(r, 'peti')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Given
                            </button>
                            <button
                              onClick={() => openNotEligibleModal(r, 'peti')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Not Eligible
                            </button>
                          </>
                        )}

                        {/* If viewing Bag Pending tab */}
                        {activeTab === 'bag_pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsGiven(r, 'bag')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Given
                            </button>
                            <button
                              onClick={() => openNotEligibleModal(r, 'bag')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Not Eligible
                            </button>
                          </>
                        )}

                        {/* If viewing Not Eligible tab */}
                        {activeTab === 'not_eligible' && (
                          <div className="flex items-center gap-1.5">
                            {currentUser.role === 'admin' ? (
                              <button
                                onClick={() => handleRevertToPending(r, 'all')}
                                disabled={isSubmitting}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold rounded-lg border border-amber-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Admin only: Revert status back to Pending"
                              >
                                <Undo2 className="w-3 h-3 text-amber-600" />
                                Revert to Pending
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Admin action required
                              </span>
                            )}
                          </div>
                        )}

                        {/* Generic / All tab actions */}
                        {(activeTab === 'given' || activeTab === 'all') && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openNotEligibleModal(r, 'all')}
                              disabled={isSubmitting}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-slate-500" />
                              Mark Not Eligible
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FEATURE 20: NOT ELIGIBLE MODAL */}
      {notEligibleModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  Mark Worker as Not Eligible
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Worker will be removed from Pending lists while preserving record history.
                </p>
              </div>
              <button
                onClick={() => setNotEligibleModalItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Worker Info Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800">
                  {notEligibleModalItem.record.workerName}
                </div>
                <div className="text-slate-500 font-mono">
                  MH Number: <strong className="text-teal-700">{notEligibleModalItem.record.mhNumber}</strong>
                </div>
                <div className="text-slate-500">
                  Taluka: {notEligibleModalItem.record.taluka || '-'} | Mobile: {notEligibleModalItem.record.mobileNumber}
                </div>
              </div>

              {/* Material Choice */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Target Material
                </label>
                <select
                  value={notEligibleModalItem.materialType}
                  onChange={(e) =>
                    setNotEligibleModalItem({
                      ...notEligibleModalItem,
                      materialType: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none cursor-pointer"
                >
                  <option value="bhandi">भांडी (Cooking Utensils)</option>
                  <option value="peti">पेटी (Trunk Box)</option>
                  <option value="bag">बॅग (Safety Gear Bag)</option>
                  <option value="all">All Materials (भांडी, पेटी, बॅग)</option>
                </select>
              </div>

              {/* Reason Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reason for Ineligibility <span className="text-rose-500">*</span>
                </label>
                <select
                  value={notEligibleReason}
                  onChange={(e) => setNotEligibleReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none cursor-pointer"
                >
                  <option value="Not eligible for material">Not eligible for material</option>
                  <option value="Already received from another source">Already received from another source</option>
                  <option value="Other">Other (Requires Remark)</option>
                </select>
              </div>

              {/* Manual Remark if Other */}
              {notEligibleReason === 'Other' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Manual Remark <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter specific reason..."
                    value={customRemark}
                    onChange={(e) => setCustomRemark(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
              )}

              {/* Updated By */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Updated By <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={updatedBy}
                  onChange={(e) => setUpdatedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>

              {/* Updated Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Updated Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={updatedDate}
                  onChange={(e) => setUpdatedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNotEligibleModalItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNotEligible}
                disabled={isSubmitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                Confirm Not Eligible
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
