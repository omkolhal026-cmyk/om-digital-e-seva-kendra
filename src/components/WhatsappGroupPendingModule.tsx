import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageCircle,
  CheckCircle2,
  Clock,
  Search,
  Download,
  RefreshCw,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Send,
  Users,
  ShieldCheck,
  PhoneOff,
  MessageSquareOff,
  Edit3,
  RotateCcw,
} from 'lucide-react';
import { WhatsappGroupTrackingRecord, User, WhatsappGroupStatus } from '../types';
import * as XLSX from 'xlsx';

interface WhatsappGroupPendingModuleProps {
  currentUser?: User | null;
  onRefreshData?: () => void;
}

export const WhatsappGroupPendingModule: React.FC<WhatsappGroupPendingModuleProps> = ({
  currentUser,
}) => {
  const [records, setRecords] = useState<WhatsappGroupTrackingRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSourceType, setSelectedSourceType] = useState<string>(''); // '' | 'Registration' | 'Renewal'
  const [statusFilter, setStatusFilter] = useState<WhatsappGroupStatus | 'All'>('Pending');

  // Modal State for Updating Status (Added / No WhatsApp / Pending)
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<WhatsappGroupTrackingRecord | null>(null);
  const [modalTargetStatus, setModalTargetStatus] = useState<WhatsappGroupStatus>('Added');
  const [modalRemark, setModalRemark] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Horizontal scroll ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const fetchRecords = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const res = await fetch('/api/whatsapp-group-trackings', { headers });
      if (!res.ok) {
        throw new Error('Failed to fetch WhatsApp group tracking records');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (err: any) {
      console.error('Error loading WhatsApp group trackings:', err);
      setError(err?.message || 'Failed to load records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [currentUser]);

  // Summary Counts
  const stats = useMemo(() => {
    const total = records.length;
    const pending = records.filter((r) => r.status === 'Pending').length;
    const added = records.filter((r) => r.status === 'Added').length;
    const noWhatsapp = records.filter((r) => r.status === 'No WhatsApp').length;
    const newRegPending = records.filter((r) => r.status === 'Pending' && r.sourceType === 'Registration').length;
    const renewalPending = records.filter((r) => r.status === 'Pending' && r.sourceType === 'Renewal').length;

    return { total, pending, added, noWhatsapp, newRegPending, renewalPending };
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. Status Filter
      if (statusFilter !== 'All' && r.status !== statusFilter) {
        return false;
      }

      // 2. Source Type Filter
      if (selectedSourceType && r.sourceType !== selectedSourceType) {
        return false;
      }

      // 3. Search Query (Name, MH Number, Mobile Number, Remark)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = r.workerName?.toLowerCase().includes(q);
        const mhMatch = r.mhNumber?.toLowerCase().includes(q);
        const mobileMatch = r.mobileNumber?.toLowerCase().includes(q);
        const remarkMatch = r.remark?.toLowerCase().includes(q);
        return nameMatch || mhMatch || mobileMatch || remarkMatch;
      }

      return true;
    });
  }, [records, statusFilter, selectedSourceType, searchQuery]);

  // Open Modal for status update
  const handleOpenStatusModal = (record: WhatsappGroupTrackingRecord, initialStatus: WhatsappGroupStatus = 'Added') => {
    setSelectedRecordForModal(record);
    setModalTargetStatus(initialStatus);
    setModalRemark(record.remark || (initialStatus === 'No WhatsApp' ? 'नंबर व्हॉट्सअ‍ॅपवर नाही (No WhatsApp)' : ''));
  };

  // Submit Status Update
  const handleSaveStatus = async (statusToSet?: WhatsappGroupStatus) => {
    if (!selectedRecordForModal) return;
    const targetStatus = statusToSet || modalTargetStatus;
    setIsSubmitting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const res = await fetch(`/api/whatsapp-group-trackings/${encodeURIComponent(selectedRecordForModal.mhNumber)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          status: targetStatus,
          remark: modalRemark.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update WhatsApp group status');
      }

      const updatedRecord = await res.json();

      // Optimistic local state update
      setRecords((prev) =>
        prev.map((r) => (r.mhNumber === updatedRecord.mhNumber ? updatedRecord : r))
      );

      // Close modal & reset
      setSelectedRecordForModal(null);
      setModalRemark('');
    } catch (err: any) {
      alert(err.message || 'An error occurred while updating status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r, index) => ({
      'Sr No': index + 1,
      'Full Name': r.workerName,
      'MH Number': r.mhNumber,
      'Mobile Number': r.mobileNumber || '-',
      'Source Type': r.sourceType === 'Registration' ? 'New Registration' : 'Renewal',
      'WhatsApp Group Status': r.status,
      'Updated Date': r.addedDate || '-',
      'Updated By': r.addedBy || '-',
      'Remark': r.remark || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'WhatsApp Group Tracking');
    
    const fileName = `WhatsApp_Group_${statusFilter}_List_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Data Slide controls
  const handleScrollLeft = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <MessageCircle className="w-8 h-8 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/30 text-emerald-100 border border-emerald-300/30">
                  Active Workers Only
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-400/30 text-teal-100 border border-teal-300/30">
                  Valid MH Number
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight mt-1 text-white">
                WhatsApp Group Tracking (व्हॉट्सअ‍ॅप ग्रुप ट्रॅकिंग)
              </h1>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl">
                Track and manage WhatsApp Group addition for Active workers. Mark as Group Added or No WhatsApp (नंबर व्हॉट्सअ‍ॅपवर नाही).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchRecords(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition cursor-pointer"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Workers Eligible */}
        <div
          onClick={() => setStatusFilter('All')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'All'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-700/50'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${statusFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Active Workers
              </p>
              <h3 className={`text-2xl font-black mt-1 ${statusFilter === 'All' ? 'text-white' : 'text-slate-800'}`}>{stats.total}</h3>
              <p className={`text-[11px] mt-0.5 ${statusFilter === 'All' ? 'text-slate-300' : 'text-slate-400'}`}>With valid MH Number</p>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${statusFilter === 'All' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}>
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* WhatsApp Group Pending */}
        <div
          onClick={() => setStatusFilter('Pending')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'Pending'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-amber-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">WhatsApp Pending</p>
              <h3 className="text-2xl font-black text-amber-900 mt-1">{stats.pending}</h3>
              <p className="text-[11px] text-amber-600 mt-0.5">
                New: {stats.newRegPending} • Ren: {stats.renewalPending}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* WhatsApp Group Added */}
        <div
          onClick={() => setStatusFilter('Added')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'Added'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-emerald-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Group Added</p>
              <h3 className="text-2xl font-black text-emerald-900 mt-1">{stats.added}</h3>
              <p className="text-[11px] text-emerald-600 mt-0.5">Joined WhatsApp Group</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* No WhatsApp Option Card */}
        <div
          onClick={() => setStatusFilter('No WhatsApp')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'No WhatsApp'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-rose-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">No WhatsApp</p>
              <h3 className="text-2xl font-black text-rose-900 mt-1">{stats.noWhatsapp}</h3>
              <p className="text-[11px] text-rose-600 mt-0.5">व्हॉट्सअ‍ॅपवर नाही / साधा फोन</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <PhoneOff className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filter & Segmented Tabs Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        {/* Status Segmented Pill Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setStatusFilter('Pending')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Pending'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending ({stats.pending})</span>
            </button>
            <button
              onClick={() => setStatusFilter('Added')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Added'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Added ({stats.added})</span>
            </button>
            <button
              onClick={() => setStatusFilter('No WhatsApp')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'No WhatsApp'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>No WhatsApp ({stats.noWhatsapp})</span>
            </button>
            <button
              onClick={() => setStatusFilter('All')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'All'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>All ({stats.total})</span>
            </button>
          </div>

          {/* Data Slide Controls */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60 ml-auto" title="Table Horizontal Slide">
            <span className="text-[10px] font-bold text-slate-500 px-1.5">Slide:</span>
            <button
              onClick={handleScrollLeft}
              className="p-1.5 hover:bg-white hover:text-emerald-700 rounded-lg text-slate-600 transition cursor-pointer shadow-none hover:shadow-xs"
              title="Scroll Left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleScrollRight}
              className="p-1.5 hover:bg-white hover:text-emerald-700 rounded-lg text-slate-600 transition cursor-pointer shadow-none hover:shadow-xs"
              title="Scroll Right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Source Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Field */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, MH Number, Mobile, Remark..."
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-medium placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Source Type Filter (Registration / Renewal) */}
          <div>
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none cursor-pointer font-medium text-slate-700"
            >
              <option value="">All Types (New & Renewal)</option>
              <option value="Registration">New Registration (नवीन नोंदणी)</option>
              <option value="Renewal">Renewal (नूतनीकरण)</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-center justify-end">
            {(searchQuery || selectedSourceType || statusFilter !== 'Pending') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSourceType('');
                  setStatusFilter('Pending');
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Showing <strong className="text-slate-800">{filteredRecords.length}</strong> workers
            {statusFilter === 'Pending' && <span className="ml-1 text-amber-600 font-semibold">(Pending WhatsApp Group)</span>}
            {statusFilter === 'Added' && <span className="ml-1 text-emerald-600 font-semibold">(Added to WhatsApp Group)</span>}
            {statusFilter === 'No WhatsApp' && <span className="ml-1 text-rose-600 font-semibold">(Not on WhatsApp / व्हॉट्सअ‍ॅपवर नाही)</span>}
          </div>
          <div className="text-[11px] text-slate-400">
            MH Number is the unique identifier • Updates sync automatically
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Loading WhatsApp Group records...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-rose-600">{error}</p>
            <button
              onClick={() => fetchRecords()}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg"
            >
              Try Again
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No matching workers found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No workers match the current filter criteria ({statusFilter}).
            </p>
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200"
          >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4 w-12 text-center">#</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Full Name</th>
                  <th className="py-3.5 px-4 min-w-[140px]">MH Number</th>
                  <th className="py-3.5 px-4 min-w-[120px]">Mobile Number</th>
                  <th className="py-3.5 px-4 min-w-[130px]">Source</th>
                  <th className="py-3.5 px-4 min-w-[170px]">WhatsApp Status</th>
                  <th className="py-3.5 px-4 min-w-[220px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r, idx) => (
                  <tr key={r.mhNumber} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-center text-slate-400 font-mono">{idx + 1}</td>
                    
                    {/* Full Name */}
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                          {r.workerName ? r.workerName.charAt(0).toUpperCase() : 'W'}
                        </div>
                        <div>
                          <span className="truncate max-w-[200px] block" title={r.workerName}>
                            {r.workerName}
                          </span>
                          {r.taluka && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              {r.taluka}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* MH Number */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-md text-[11px] text-slate-800">
                        {r.mhNumber}
                      </span>
                    </td>

                    {/* Mobile Number */}
                    <td className="py-3.5 px-4 text-slate-600 font-mono font-medium">
                      {r.mobileNumber ? (
                        <a
                          href={`tel:${r.mobileNumber}`}
                          className="hover:text-emerald-600 underline decoration-slate-300"
                        >
                          {r.mobileNumber}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          r.sourceType === 'Registration'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {r.sourceType === 'Registration' ? 'New Registration' : 'Renewal'}
                      </span>
                    </td>

                    {/* WhatsApp Status Badge */}
                    <td className="py-3.5 px-4">
                      {r.status === 'Added' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Added to Group</span>
                          </span>
                          {r.addedDate && (
                            <p className="text-[10px] text-slate-400 font-medium pl-1">
                              {r.addedDate} {r.addedBy ? `by ${r.addedBy}` : ''}
                            </p>
                          )}
                          {r.remark && (
                            <p className="text-[10px] text-slate-500 italic pl-1 truncate max-w-[160px]" title={r.remark}>
                              "{r.remark}"
                            </p>
                          )}
                        </div>
                      ) : r.status === 'No WhatsApp' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <PhoneOff className="w-3.5 h-3.5 text-rose-600" />
                            <span>No WhatsApp (नाही)</span>
                          </span>
                          {r.addedDate && (
                            <p className="text-[10px] text-slate-400 font-medium pl-1">
                              {r.addedDate} {r.addedBy ? `by ${r.addedBy}` : ''}
                            </p>
                          )}
                          {r.remark && (
                            <p className="text-[10px] text-rose-700/80 italic pl-1 truncate max-w-[160px]" title={r.remark}>
                              "{r.remark}"
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      {r.status === 'Pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Add to Group Button */}
                          <button
                            onClick={() => handleOpenStatusModal(r, 'Added')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                            title="Mark as Added to WhatsApp Group"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>☑ Added</span>
                          </button>

                          {/* No WhatsApp Quick Button */}
                          <button
                            onClick={() => handleOpenStatusModal(r, 'No WhatsApp')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                            title="Mark as No WhatsApp / Not on WhatsApp"
                          >
                            <PhoneOff className="w-3.5 h-3.5 text-rose-600" />
                            <span>🚫 No WhatsApp</span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenStatusModal(r, r.status)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-bold transition cursor-pointer"
                            title="Edit Status / Change Remark"
                          >
                            <Edit3 className="w-3 h-3 text-slate-500" />
                            <span>Edit Status</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Update WhatsApp Group Status (Added / No WhatsApp / Pending) */}
      {selectedRecordForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedRecordForModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                modalTargetStatus === 'Added'
                  ? 'bg-emerald-100 text-emerald-700'
                  : modalTargetStatus === 'No WhatsApp'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {modalTargetStatus === 'Added' ? (
                  <MessageCircle className="w-6 h-6" />
                ) : modalTargetStatus === 'No WhatsApp' ? (
                  <PhoneOff className="w-6 h-6" />
                ) : (
                  <Clock className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  WhatsApp Group Tracking Status
                </h3>
                <p className="text-xs text-slate-500">
                  व्हॉट्सअ‍ॅप ग्रुप किंवा स्टेटसची नोंद करा
                </p>
              </div>
            </div>

            {/* Worker summary box */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Worker Name:</span>
                <span className="font-bold text-slate-800">{selectedRecordForModal.workerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MH Number:</span>
                <span className="font-mono font-bold text-emerald-700">{selectedRecordForModal.mhNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-mono text-slate-700">{selectedRecordForModal.mobileNumber || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source:</span>
                <span className="font-semibold text-slate-700">
                  {selectedRecordForModal.sourceType === 'Registration' ? 'New Registration' : 'Renewal'}
                </span>
              </div>
            </div>

            {/* Status Selector Options */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Select Status / स्टेटस निवडा:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalTargetStatus('Added');
                    if (!modalRemark || modalRemark.includes('व्हॉट्सअ‍ॅपवर नाही')) {
                      setModalRemark('Added to MH-09 WhatsApp Group');
                    }
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition cursor-pointer ${
                    modalTargetStatus === 'Added'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Added</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalTargetStatus('No WhatsApp');
                    if (!modalRemark || modalRemark.includes('Added to')) {
                      setModalRemark('नंबर व्हॉट्सअ‍ॅपवर नाही (No WhatsApp)');
                    }
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition cursor-pointer ${
                    modalTargetStatus === 'No WhatsApp'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <PhoneOff className="w-4 h-4 text-rose-600" />
                  <span>No WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalTargetStatus('Pending');
                    setModalRemark('');
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition cursor-pointer ${
                    modalTargetStatus === 'Pending'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Pending</span>
                </button>
              </div>
            </div>

            {/* Quick remark suggestion chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Remark / रिमार्क (Optional)
              </label>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {[
                  'नंबर व्हॉट्सअ‍ॅपवर नाही',
                  'साधा फोन / कीपॅड (Keypad)',
                  'चुकीचा नंबर (Invalid No)',
                  'Added to MH-09 Group',
                  'Group Link sent via SMS',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setModalRemark(chip)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md transition cursor-pointer"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={modalRemark}
                onChange={(e) => setModalRemark(e.target.value)}
                placeholder="e.g. Added to MH-09 Group / नंबर व्हॉट्सअ‍ॅपवर नाही / साधा फोन"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-medium text-slate-800"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedRecordForModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              
              {modalTargetStatus === 'No WhatsApp' ? (
                <button
                  type="button"
                  onClick={() => handleSaveStatus('No WhatsApp')}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-900/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <PhoneOff className="w-4 h-4" />
                  )}
                  <span>Confirm No WhatsApp (व्हॉट्सअ‍ॅपवर नाही)</span>
                </button>
              ) : modalTargetStatus === 'Pending' ? (
                <button
                  type="button"
                  onClick={() => handleSaveStatus('Pending')}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-900/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  <span>Revert to Pending</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSaveStatus('Added')}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/20 transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Confirm Added (ग्रुपमध्ये जोडले)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

