import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Award,
  Search,
  PlusCircle,
  Download,
  Printer,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
  FileText,
  Filter,
  DollarSign,
  UserCheck,
  Building2,
  Edit,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  AlertTriangle,
  FileSpreadsheet,
  Upload,
  Copy,
  Check,
} from 'lucide-react';
import { WorkerClaim, WorkerRegistration, Scheme, User } from '../types';
import { exportToCSV, formatDate } from '../utils/exportUtils';
import { SCHEMES_LIST, MAHARASHTRA_TALUKAS } from '../data/mockData';
import { OldClaimsManager } from './OldClaimsManager';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';
import { UiverseCheckbox } from './UiverseCheckbox';
import { TableSlideControls } from './TableSlideControls';

interface ClaimModuleProps {
  claims?: WorkerClaim[];
  registrations?: WorkerRegistration[];
  schemes?: Scheme[];
  currentUser?: User;
  users?: User[];
  onAddClaim?: (claim: Omit<WorkerClaim, 'id'>) => Promise<void>;
  onUpdateClaimStatus?: (id: string, status: WorkerClaim['status'], remarks?: string) => Promise<void>;
  onDeleteClaim?: (id: string) => Promise<void>;
  onDeleteClaimsBulk?: (ids: string[]) => Promise<void>;
  onOpenPrintSlip?: (type: 'claim', data: any) => void;
  onResetClaims?: () => void;
}

export const ClaimModule: React.FC<ClaimModuleProps> = ({
  claims = [],
  registrations = [],
  schemes = SCHEMES_LIST,
  currentUser,
  users = [],
  onAddClaim,
  onUpdateClaimStatus,
  onDeleteClaim,
  onDeleteClaimsBulk,
  onOpenPrintSlip,
  onResetClaims,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedMh, setCopiedMh] = useState<string | null>(null);

  const handleCopyMh = (mh: string) => {
    if (!mh) return;
    const clean = mh.trim();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(clean).catch(() => {});
    }
    setCopiedMh(clean);
    setTimeout(() => {
      setCopiedMh((prev) => (prev === clean ? null : prev));
    }, 2000);
  };
  const claimTableRef = useRef<HTMLDivElement>(null);
  const [activeClaimTab, setActiveClaimTab] = useState<'active' | 'old'>('active');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [talukaFilter, setTalukaFilter] = useState<string>('');
  const [fromSourceFilter, setFromSourceFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<WorkerClaim | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string; claimId: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{
    isOpen: boolean;
    ids: string[];
    title: string;
    description: string;
    sampleNames: string[];
  } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const [operatorName, setOperatorName] = useState(currentUser?.name || '');
  const [isCustomOperator, setIsCustomOperator] = useState(false);

  const operatorOptions = React.useMemo(() => {
    const list = new Set<string>();
    if (currentUser?.name) list.add(currentUser.name);
    if (users && users.length > 0) {
      users.forEach((u) => {
        if (u.name) list.add(u.name);
      });
    }
    claims.forEach((c) => {
      if (c.operatorName) list.add(c.operatorName);
    });
    return Array.from(list).filter(Boolean).sort();
  }, [users, currentUser?.name, claims]);

  // Form State for new claim
  const [selectedMhNumber, setSelectedMhNumber] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [taluka, setTaluka] = useState(MAHARASHTRA_TALUKAS[0] || 'Junnar');
  const [scheme1Id, setScheme1Id] = useState(schemes[0]?.id || '');
  const [scheme2Id, setScheme2Id] = useState('');
  const [remarks, setRemarks] = useState('');

  // Status edit state
  const [editStatus, setEditStatus] = useState<WorkerClaim['status']>('Submitted');
  const [editRemarks, setEditRemarks] = useState('');

  // Auto-fill worker details when MH number changes or worker selected
  const handleWorkerSelect = (mh: string) => {
    setSelectedMhNumber(mh);
    const reg = registrations.find(
      (r) => r.mhNumber.toLowerCase() === mh.toLowerCase() || r.id === mh
    );
    if (reg) {
      setWorkerName(reg.workerName);
      setMobileNumber(reg.mobileNumber);
      if (reg.taluka) setTaluka(reg.taluka);
    }
  };

  const scheme1 = schemes.find((s) => s.id === scheme1Id);
  const scheme2 = schemes.find((s) => s.id === scheme2Id);
  const scheme1Amount = scheme1 ? scheme1.amount : 0;
  const scheme2Amount = scheme2 ? scheme2.amount : 0;
  const totalAmount = scheme1Amount + scheme2Amount;

  const handleSubmitNewClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMhNumber || !workerName || !scheme1Id) {
      alert('कृपया कामगार MH नंबर, नाव आणि किमान एक योजना निवडा.');
      return;
    }

    if (!onAddClaim) return;

    setSubmitting(true);
    try {
      await onAddClaim({
        mhNumber: selectedMhNumber.toUpperCase(),
        workerName: workerName.trim(),
        mobileNumber: mobileNumber.trim(),
        taluka: taluka,
        scheme1Id: scheme1?.id || scheme1Id,
        scheme1Name: scheme1?.name || 'Selected Scheme 1',
        scheme1Amount: scheme1Amount,
        scheme2Id: scheme2 ? scheme2.id : undefined,
        scheme2Name: scheme2 ? scheme2.name : undefined,
        scheme2Amount: scheme2Amount > 0 ? scheme2Amount : undefined,
        totalAmount: totalAmount,
        operatorName: operatorName || currentUser?.name || 'Operator',
        status: 'Submitted',
        remarks: remarks.trim() || 'Claim application submitted.',
        claimDate: new Date().toISOString().split('T')[0],
      });

      setIsAddModalOpen(false);
      // Reset form
      setSelectedMhNumber('');
      setWorkerName('');
      setMobileNumber('');
      setRemarks('');
    } catch (err: any) {
      alert(err.message || 'Error submitting claim.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim || !onUpdateClaimStatus) return;

    setSubmitting(true);
    try {
      await onUpdateClaimStatus(editingClaim.id, editStatus, editRemarks);
      setEditingClaim(null);
    } catch (err: any) {
      alert(err.message || 'Error updating claim status.');
    } finally {
      setSubmitting(false);
    }
  };

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    if (!filteredClaims.length) {
      alert('एक्सपोर्ट करण्यासाठी कोणताही डेटा उपलब्ध नाही.');
      return;
    }

    const rows = filteredClaims.map((c, idx) => ({
      'SR.NO': idx + 1,
      'CLAIM ID': c.id,
      'MH NUMBER': c.mhNumber,
      'WORKER NAME': c.workerName,
      'MOBILE NUMBER': c.mobileNumber,
      'TALUKA': c.taluka,
      'SCHEME 1': c.scheme1Name,
      'SCHEME 2': c.scheme2Name || '-',
      'TOTAL AMOUNT (₹)': c.totalAmount,
      'STATUS': c.status,
      'CLAIM DATE': c.claimDate,
      'OPERATOR': c.operatorName,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Active_Claims');
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `MBOCWW_Active_Claims_${dateStr}.xlsx`);
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!claims.length) return;
    const headers = ['Claim ID', 'MH Number', 'Worker Name', 'Mobile', 'Taluka', 'Scheme 1', 'Scheme 2', 'Total Amount', 'Status', 'Claim Date', 'Operator'];
    const rows = filteredClaims.map((c) => [
      c.id,
      c.mhNumber,
      `"${c.workerName}"`,
      c.mobileNumber,
      c.taluka,
      `"${c.scheme1Name}"`,
      `"${c.scheme2Name || ''}"`,
      c.totalAmount,
      c.status,
      c.claimDate,
      `"${c.operatorName}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MBOCWW_Claims_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to extract From Source from claim or linked registration
  const getClaimFromSource = (c: WorkerClaim) => {
    if (c.fromSource?.trim()) return c.fromSource.trim();
    const reg = registrations.find(
      (r) => r.mhNumber && c.mhNumber && r.mhNumber.toLowerCase() === c.mhNumber.toLowerCase()
    );
    return reg?.fromSource?.trim() || '';
  };

  const fromSourceOptions = React.useMemo(() => {
    const set = new Set<string>();
    claims.forEach((c) => {
      const src = getClaimFromSource(c);
      if (src) set.add(src);
    });
    return Array.from(set).sort();
  }, [claims, registrations]);

  // Filtering
  const filteredClaims = claims.filter((c) => {
    const matchesSearch =
      c.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mhNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mobileNumber.includes(searchTerm) ||
      (c.scheme1Name && c.scheme1Name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.scheme2Name && c.scheme2Name.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    const matchesTaluka = !talukaFilter || c.taluka === talukaFilter;
    const matchesFromSource =
      !fromSourceFilter ||
      Boolean(getClaimFromSource(c).toLowerCase().includes(fromSourceFilter.trim().toLowerCase()));
    const matchesFromDate = !fromDate || (c.claimDate && c.claimDate >= fromDate);
    const matchesToDate = !toDate || (c.claimDate && c.claimDate <= toDate);

    return matchesSearch && matchesStatus && matchesTaluka && matchesFromSource && matchesFromDate && matchesToDate;
  });

  // Reset page when filter inputs change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, talukaFilter, fromSourceFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredClaims.length / (pageSize === -1 ? filteredClaims.length || 1 : pageSize)));
  const paginatedClaims = React.useMemo(() => {
    if (pageSize === -1) return filteredClaims;
    const start = (currentPage - 1) * pageSize;
    return filteredClaims.slice(start, start + pageSize);
  }, [filteredClaims, currentPage, pageSize]);

  // Bulk Selection and Delete Handlers
  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllCurrentPageSelected =
    paginatedClaims.length > 0 && paginatedClaims.every((c) => selectedIds.has(c.id));

  const toggleSelectCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedClaims.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedClaims.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredClaims.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const openDeleteSelectedModal = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedItems = claims.filter((c) => selectedIds.has(c.id));
    const sampleNames = selectedItems.slice(0, 4).map((c) => `${c.workerName} (${c.id})`);
    setBulkDeleteModal({
      isOpen: true,
      ids,
      title: `निवडलेले ${ids.length} क्लेम फॉर्म डिलीट करा (Delete Selected Claims)`,
      description: `तुम्हाला खरोखर निवडलेले ${ids.length} क्लेम फॉर्म डेटाबेसमधून कायमचे डिलीट करायचे आहेत का?`,
      sampleNames,
    });
  };

  const openDeleteFilteredModal = () => {
    const ids = filteredClaims.map((c) => c.id);
    if (ids.length === 0) return;
    const sampleNames = filteredClaims.slice(0, 4).map((c) => `${c.workerName} (${c.id})`);
    setBulkDeleteModal({
      isOpen: true,
      ids,
      title: `सर्व फिल्टर केलेले ${ids.length} क्लेम फॉर्म डिलीट करा (Delete All Filtered Claims)`,
      description: `सध्या फिल्टर केलेले सर्व ${ids.length} क्लेम फॉर्म कायमचे डिलीट करायचे आहेत का?`,
      sampleNames,
    });
  };

  const handleExecuteBulkDelete = async () => {
    if (!bulkDeleteModal || bulkDeleteModal.ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      if (onDeleteClaimsBulk) {
        await onDeleteClaimsBulk(bulkDeleteModal.ids);
      } else if (onDeleteClaim) {
        for (const id of bulkDeleteModal.ids) {
          await onDeleteClaim(id);
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        bulkDeleteModal.ids.forEach((id) => next.delete(id));
        return next;
      });
      setBulkDeleteModal(null);
    } catch (err: any) {
      alert(err?.message || 'दावा डिलीट करण्यात अडचण आली.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const getStatusBadge = (status: WorkerClaim['status']) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Disbursed':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Under Scrutiny':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Module Navigation: Active Claims vs. Old Claims Archive */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 rounded-xl w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveClaimTab('active')}
            className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeClaimTab === 'active'
                ? 'bg-white text-blue-900 shadow-sm border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-4 h-4 text-blue-700" />
            <span>चालू क्लेम व्यवस्थापन (Active Claims)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
              {claims.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveClaimTab('old')}
            className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeClaimTab === 'old'
                ? 'bg-blue-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>जुना क्लेम डेटा (Old Claims Archive & Import)</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              स्वतंत्र डेटा
            </span>
          </button>
        </div>

        {activeClaimTab === 'active' && (
          <button
            type="button"
            onClick={() => setActiveClaimTab('old')}
            className="py-2 px-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs self-end sm:self-center"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-700" />
            <span>जुना क्लेम डेटा इम्पोर्ट करा (Import Old Data)</span>
          </button>
        )}
      </div>

      {activeClaimTab === 'old' ? (
        <OldClaimsManager
          currentUser={currentUser}
          onOpenPrintSlip={onOpenPrintSlip}
        />
      ) : (
        <>
          {/* Coming Soon Notice Banner */}
      <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="p-3 rounded-xl bg-amber-500 text-white shadow-sm flex-shrink-0">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-amber-950">
                Claim Management - Coming Soon (क्लेम अर्ज सेवा - लवकरच उपलब्ध)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300">
                अत्ता सेवा बंद आहे
              </span>
            </div>
            <p className="text-xs font-semibold text-amber-800/90 mt-1">
              कल्याणकारी योजना क्लेम अर्ज प्रक्रिया अत्ता बंद करण्यात आली आहे. नवीन सिस्टीम अपडेटमध्ये ही सेवा लवकरच पूर्ववत सुरू करण्यात येईल.
            </p>
          </div>
        </div>
        <div className="px-3.5 py-1.5 rounded-xl bg-white/80 border border-amber-200 text-amber-900 text-xs font-bold whitespace-nowrap shadow-2xs">
          Status: Temporarily Paused
        </div>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Welfare Scheme Claim Management (योजना क्लेम व्यवस्थापन)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Coming Soon
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            MBOCWW welfare scheme benefit claims processing and scrutiny module.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => alert('क्लेम अर्ज सेवा अत्ता बंद आहे. आपण ही सेवा लवकरच नवीन अपडेटमध्ये उपलब्ध करू.')}
            className="py-2.5 px-4 rounded-xl bg-slate-200 text-slate-500 font-bold text-xs border border-slate-300 flex items-center gap-2 cursor-not-allowed opacity-80"
            title="Service temporarily closed"
          >
            <PlusCircle className="w-4 h-4 text-slate-400" />
            <span>Apply Scheme Claim (Coming Soon)</span>
          </button>

          {(currentUser?.role === 'admin' || currentUser?.permissions?.canExport) && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportExcel}
                className="py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="एक्सेल (.xlsx) फाईलमध्ये एक्सपोर्ट करा"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel (.xlsx)</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                title="CSV मध्ये एक्सपोर्ट करा"
              >
                <FileText className="w-4 h-4 text-blue-700" />
                <span>Export CSV</span>
              </button>
            </div>
          )}

          {currentUser?.role === 'admin' && onResetClaims && claims.length > 0 && (
            <button
              onClick={onResetClaims}
              className="py-2.5 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Reset all claims"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {['All', 'Submitted', 'Under Scrutiny', 'Approved', 'Disbursed', 'Rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  statusFilter === status
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status === 'All' ? 'सर्व दावे (All Claims)' : status}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
            {/* From Source Filter */}
            <div className="min-w-[180px]">
              <FromSourceFilterSelect
                value={fromSourceFilter}
                onChange={setFromSourceFilter}
                options={fromSourceOptions}
                moduleType="claim"
                placeholder="सर्व स्त्रोत (All From)..."
              />
            </div>

            {/* Taluka Dropdown */}
            <select
              value={talukaFilter}
              onChange={(e) => setTalukaFilter(e.target.value)}
              className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="">All Talukas (सर्व तालुके)</option>
              {MAHARASHTRA_TALUKAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Worker, MH No, Claim ID, Scheme..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-blue-700" />
            <span className="font-semibold text-slate-600">दावा अर्ज दिनांक (Claim Date):</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
              title="From Date"
            />
            <span className="text-slate-400">ते</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
              title="To Date"
            />
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <span className="text-slate-500 font-medium">
              एकूण {claims.length} पैकी <strong className="text-blue-900 font-black">{filteredClaims.length}</strong> दावे सापडले
            </span>
            {(searchTerm || statusFilter !== 'All' || talukaFilter || fromSourceFilter || fromDate || toDate) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('All');
                    setTalukaFilter('');
                    setFromSourceFilter('');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="py-1 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
                >
                  फिल्टर रिसेट (Clear Filters)
                </button>
                {filteredClaims.length > 0 && (
                  <button
                    type="button"
                    onClick={openDeleteFilteredModal}
                    className="py-1 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="सध्या फिल्टर केलेले सर्व क्लेम फॉर्म डिलीट करा"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>फिल्टर केलेले सर्व ({filteredClaims.length}) डिलीट करा</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Claims List Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Bulk Selection Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-black text-xs shadow-xs">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{selectedIds.size} क्लेम निवडले</span>
              </span>
              {selectedIds.size < filteredClaims.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer ml-1"
                >
                  सर्व {filteredClaims.length} फिल्टर केलेले क्लेम निवडा (Select All Filtered)
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="py-1.5 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold cursor-pointer transition-all"
              >
                निवड रद्द करा (Deselect)
              </button>
              <button
                type="button"
                onClick={openDeleteSelectedModal}
                className="py-1.5 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>निवडलेले {selectedIds.size} फॉर्म डिलीट करा</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Slide Header Controls */}
        <TableSlideControls
          onSlideLeft={() => claimTableRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          onSlideRight={() => claimTableRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          title="↔ Slide Table / माहिती सरकवा"
          subtitle="(डावीकडे / उजवीकडे सरकवण्यासाठी खालील बटने वापरा)"
        />

        <div ref={claimTableRef} className="overflow-x-auto scroll-smooth">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <div className="flex items-center justify-center">
                    <UiverseCheckbox
                      size={18}
                      checked={isAllCurrentPageSelected}
                      onChange={toggleSelectCurrentPage}
                      title={isAllCurrentPageSelected ? "या पानावरील सर्व निवड रद्द करा" : "या पानावरील सर्व निवडा"}
                      id="claim-header-select-all"
                    />
                  </div>
                </th>
                <th className="px-4 py-3 min-w-[120px]">Claim ID & Date</th>
                <th className="px-4 py-3 min-w-[150px]">Worker & MH Number</th>
                <th className="px-4 py-3 min-w-[140px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Taluka</span>
                    </div>
                    <select
                      value={talukaFilter}
                      onChange={(e) => setTalukaFilter(e.target.value)}
                      className="w-full text-[10px] font-semibold normal-case py-0.5 px-1 bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">सर्व तालुके (All)</option>
                      {MAHARASHTRA_TALUKAS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="px-4 py-3 min-w-[160px]">Assigned Schemes</th>
                <th className="px-4 py-3 min-w-[120px]">Benefit Amount</th>
                <th className="px-4 py-3 min-w-[140px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Status</span>
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full text-[10px] font-semibold normal-case py-0.5 px-1 bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="All">सर्व स्थिती (All)</option>
                      <option value="Submitted">Submitted</option>
                      <option value="Under Scrutiny">Under Scrutiny</option>
                      <option value="Approved">Approved</option>
                      <option value="Disbursed">Disbursed</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">कोणत्याही क्लेम नोंदी आढळल्या नाहीत.</p>
                    <p className="text-xs">No welfare claim records found matching criteria.</p>
                  </td>
                </tr>
              ) : (
                paginatedClaims.map((claim) => (
                  <tr key={claim.id} className={`hover:bg-slate-50/80 transition-colors ${selectedIds.has(claim.id) ? 'bg-blue-50/60' : ''}`}>
                    <td className="px-3 py-3.5 text-center">
                      <div className="flex items-center justify-center">
                        <UiverseCheckbox
                          size={18}
                          checked={selectedIds.has(claim.id)}
                          onChange={() => toggleSelectId(claim.id)}
                          id={`claim-row-${claim.id}`}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{claim.id}</div>
                      <div className="text-[11px] text-slate-500">{formatDate(claim.claimDate)}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{claim.workerName}</div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-blue-700 font-semibold">
                        <span>{claim.mhNumber}</span>
                        {claim.mhNumber && !claim.mhNumber.startsWith('PENDING-') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMh(claim.mhNumber);
                            }}
                            className={`p-1 rounded border transition-all cursor-pointer ${
                              copiedMh === claim.mhNumber
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : 'bg-slate-50 hover:bg-blue-100 text-slate-500 hover:text-blue-700 border-slate-200'
                            }`}
                            title="MH नंबर कॉपी करा (Copy MH Number)"
                          >
                            {copiedMh === claim.mhNumber ? (
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                        <span>{claim.taluka} • 📱 {claim.mobileNumber}</span>
                        {getClaimFromSource(claim) && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-semibold bg-blue-50 text-blue-700 rounded border border-blue-200">
                            From: {getClaimFromSource(claim)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800">{claim.scheme1Name}</div>
                      {claim.scheme2Name && (
                        <div className="text-[11px] text-slate-500 mt-0.5">+ {claim.scheme2Name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700 text-sm">
                      ₹{claim.totalAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadge(claim.status)}`}>
                        {claim.status}
                      </span>
                      {claim.remarks && (
                        <div className="text-[10px] text-slate-500 mt-1 truncate max-w-[150px]" title={claim.remarks}>
                          {claim.remarks}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditingClaim(claim);
                            setEditStatus(claim.status);
                            setEditRemarks(claim.remarks || '');
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-700 border border-slate-200 transition-colors cursor-pointer"
                          title="Update Claim Status"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {onOpenPrintSlip && (
                          <button
                            onClick={() => onOpenPrintSlip('claim', claim)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 text-emerald-700 border border-slate-200 transition-colors cursor-pointer"
                            title="Print Claim Receipt Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {onDeleteClaim && (
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmItem({ id: claim.id, name: claim.workerName, claimId: claim.id })}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-rose-600 border border-slate-200 transition-colors cursor-pointer"
                            title="Delete Claim"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredClaims.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium">
              <span>
                दाखवत आहे{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filteredClaims.length)}
                </strong>{' '}
                ते{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? filteredClaims.length : Math.min(currentPage * pageSize, filteredClaims.length)}
                </strong>{' '}
                (एकूण <strong className="text-blue-900 font-bold">{filteredClaims.length}</strong> क्लेम)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">प्रति पान (Per page):</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 font-semibold py-1 px-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={-1}>सर्व (All)</option>
                </select>
              </div>

              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="मागील पान"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-2 font-bold text-slate-800">
                    पान {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="पुढील पान"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New Claim Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Award className="w-5 h-5 text-blue-700" />
              <h3 className="text-lg font-extrabold text-slate-900">
                New Welfare Scheme Claim Application
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-5 font-medium">
              Select worker registration details and choose applicable MBOCWW welfare schemes.
            </p>

            <form onSubmit={handleSubmitNewClaim} className="space-y-4">
              {/* Select Registered Worker */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Worker MH Registration Number / Select Registered Worker *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedMhNumber}
                    onChange={(e) => handleWorkerSelect(e.target.value)}
                    placeholder="Enter MH Number e.g. MH-12-2026-10492"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
                    required
                  />
                  {registrations.length > 0 && (
                    <select
                      onChange={(e) => handleWorkerSelect(e.target.value)}
                      className="w-44 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800"
                    >
                      <option value="">-- Choose Worker --</option>
                      {registrations.map((r) => (
                        <option key={r.id} value={r.mhNumber}>
                          {r.workerName} ({r.mhNumber})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Worker Full Name *
                  </label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="कामगाराचे संपूर्ण नाव"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="10 digits"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Taluka / Tehsil *
                </label>
                <select
                  value={taluka}
                  onChange={(e) => setTaluka(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                >
                  {MAHARASHTRA_TALUKAS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheme 1 Selection */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-2">
                <label className="block text-xs font-extrabold text-blue-900">
                  Primary Scheme Selection (प्रमुख योजना 1) *
                </label>
                <select
                  value={scheme1Id}
                  onChange={(e) => setScheme1Id(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-semibold"
                  required
                >
                  {schemes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ₹{s.amount.toLocaleString('en-IN')} ({s.category})
                    </option>
                  ))}
                </select>
                {scheme1 && (
                  <p className="text-[11px] text-blue-800 font-medium">
                    {scheme1.description}
                  </p>
                )}
              </div>

              {/* Scheme 2 Selection (Optional) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Secondary Scheme Selection (दुय्यम योजना 2 - ऐच्छिक)
                </label>
                <select
                  value={scheme2Id}
                  onChange={(e) => setScheme2Id(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900"
                >
                  <option value="">-- No Second Scheme --</option>
                  {schemes
                    .filter((s) => s.id !== scheme1Id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — ₹{s.amount.toLocaleString('en-IN')} ({s.category})
                      </option>
                    ))}
                </select>
              </div>

              {/* Total Calculation Card */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-800">Total Approved Benefit Grant Amount</span>
                  <p className="text-[11px] text-emerald-600">Calculated automatically based on selected welfare schemes.</p>
                </div>
                <div className="text-xl font-extrabold text-emerald-800">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Form Filled By (ऑपरेटर नाव) *
                </label>
                {currentUser?.role === 'admin' ? (
                  <div className="space-y-1.5">
                    <select
                      value={isCustomOperator ? '__custom__' : (operatorName || currentUser?.name || '')}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomOperator(true);
                          setOperatorName('');
                        } else {
                          setIsCustomOperator(false);
                          setOperatorName(e.target.value);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900"
                    >
                      <option value="">-- ऑपरेटर निवडा (Select Operator) --</option>
                      {operatorOptions.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                      <option value="__custom__">➕ इतर नवीन नाव टाईप करा (Type Custom Name)</option>
                    </select>
                    {isCustomOperator && (
                      <input
                        type="text"
                        value={operatorName}
                        onChange={(e) => setOperatorName(e.target.value)}
                        placeholder="ऑपरेटरचे नाव टाईप करा..."
                        className="w-full px-3 py-2 rounded-xl bg-blue-50 border border-blue-400 text-xs font-bold text-blue-900"
                        autoFocus
                        required
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={operatorName || currentUser?.name || ''}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 cursor-not-allowed"
                    readOnly
                  />
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Application Remarks / Notes
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. All certificates verified by operator."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Submitting Claim...' : 'Submit Claim Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Claim Status Modal */}
      {editingClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setEditingClaim(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Update Claim Status ({editingClaim.id})
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-medium">
              Worker: <span className="font-bold text-slate-800">{editingClaim.workerName}</span> ({editingClaim.mhNumber})
            </p>

            <form onSubmit={handleUpdateStatusSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Claim Status *
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as WorkerClaim['status'])}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900"
                >
                  <option value="Submitted">Submitted (प्रस्ताव सादर केला)</option>
                  <option value="Under Scrutiny">Under Scrutiny (कागदपत्रे तपासणी सुरु)</option>
                  <option value="Approved">Approved (प्रस्ताव मंजूर झाला)</option>
                  <option value="Disbursed">Disbursed (रक्कम बँक खात्यावर जमा झाली)</option>
                  <option value="Rejected">Rejected (प्रस्ताव अमान्य झाला)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Status Update Remarks / Reason
                </label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Enter remarks for worker..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClaim(null)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Save Claim Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SINGLE CLAIM DELETE CONFIRMATION MODAL */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-rose-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 font-bold shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  दावा नोंद डिलीट करा? (Delete Claim)
                </h3>
                <p className="text-xs text-rose-700 font-bold">
                  ⚠️ सावधान! हे रेकॉर्ड कायमचे हटवले जाईल.
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-3.5 text-xs text-slate-700 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">Claim ID:</span>{' '}
                <span className="font-bold text-slate-900">{deleteConfirmItem.claimId}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Worker Name:</span>{' '}
                <span className="font-bold text-slate-900">{deleteConfirmItem.name}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = deleteConfirmItem.id;
                  setDeleteConfirmItem(null);
                  if (onDeleteClaim) {
                    await onDeleteClaim(id);
                  }
                }}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>होय, डिलीट करा (Delete)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {bulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-900 space-y-4">
            <button
              onClick={() => !isBulkDeleting && setBulkDeleteModal(null)}
              disabled={isBulkDeleting}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {bulkDeleteModal.title}
                </h3>
                <p className="text-xs text-rose-600 font-semibold">
                  सावधान: ही कृती कायमस्वरूपी आहे (Irreversible Action)
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {bulkDeleteModal.description}
            </p>

            {bulkDeleteModal.sampleNames && bulkDeleteModal.sampleNames.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  डिलीट होणाऱ्या नोंदींचा नमुना (Sample Records):
                </div>
                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                  {bulkDeleteModal.sampleNames.map((s, idx) => (
                    <li key={idx} className="truncate font-medium">{s}</li>
                  ))}
                  {bulkDeleteModal.ids.length > bulkDeleteModal.sampleNames.length && (
                    <li className="text-slate-400 italic list-none pt-0.5">
                      ...आणि इतर {bulkDeleteModal.ids.length - bulkDeleteModal.sampleNames.length} नोंदी
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkDeleteModal(null)}
                disabled={isBulkDeleting}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                disabled={isBulkDeleting}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <span className="button-spinner" />
                    <span>डिलीट होत आहे...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>होय, कायमचे डिलीट करा ({bulkDeleteModal.ids.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
