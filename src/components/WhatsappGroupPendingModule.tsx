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
} from 'lucide-react';
import { WhatsappGroupTrackingRecord, User } from '../types';
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
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'Added' | 'All'>('Pending');

  // Modal State for Mark as Added
  const [selectedRecordForAdded, setSelectedRecordForAdded] = useState<WhatsappGroupTrackingRecord | null>(null);
  const [addedRemark, setAddedRemark] = useState<string>('');
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
    const newRegPending = records.filter((r) => r.status === 'Pending' && r.sourceType === 'Registration').length;
    const renewalPending = records.filter((r) => r.status === 'Pending' && r.sourceType === 'Renewal').length;

    return { total, pending, added, newRegPending, renewalPending };
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

      // 3. Search Query (Name, MH Number, Mobile Number)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = r.workerName?.toLowerCase().includes(q);
        const mhMatch = r.mhNumber?.toLowerCase().includes(q);
        const mobileMatch = r.mobileNumber?.toLowerCase().includes(q);
        return nameMatch || mhMatch || mobileMatch;
      }

      return true;
    });
  }, [records, statusFilter, selectedSourceType, searchQuery]);

  // Handle Mark as Added Confirmation
  const handleConfirmMarkAsAdded = async () => {
    if (!selectedRecordForAdded) return;
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

      const res = await fetch(`/api/whatsapp-group-trackings/${encodeURIComponent(selectedRecordForAdded.mhNumber)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          status: 'Added',
          remark: addedRemark.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update WhatsApp group status');
      }

      const updatedRecord = await res.json();

      // Update local state
      setRecords((prev) =>
        prev.map((r) => (r.mhNumber === updatedRecord.mhNumber ? updatedRecord : r))
      );

      // Close modal & reset
      setSelectedRecordForAdded(null);
      setAddedRemark('');
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
      'Added Date': r.addedDate || '-',
      'Added By': r.addedBy || '-',
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
                Track and manage WhatsApp Group addition for Active workers with valid MH numbers (New Registrations & Renewals).
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
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Eligible Active Workers</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{stats.total}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">With valid MH Number</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* WhatsApp Group Pending */}
        <div
          onClick={() => setStatusFilter('Pending')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'Pending'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/40'
              : 'bg-white border-slate-200/80 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">WhatsApp Pending</p>
              <h3 className="text-2xl font-black text-amber-900 mt-1">{stats.pending}</h3>
              <p className="text-[11px] text-amber-600 mt-0.5">
                New: {stats.newRegPending} • Renewal: {stats.renewalPending}
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
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/40'
              : 'bg-white border-slate-200/80 hover:border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Group Added</p>
              <h3 className="text-2xl font-black text-emerald-900 mt-1">{stats.added}</h3>
              <p className="text-[11px] text-emerald-600 mt-0.5">Successfully joined WhatsApp Group</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Status Filter Toggle */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status View Filter</p>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl mt-2">
            <button
              onClick={() => setStatusFilter('Pending')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Pending'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({stats.pending})
            </button>
            <button
              onClick={() => setStatusFilter('Added')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Added'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Added ({stats.added})
            </button>
            <button
              onClick={() => setStatusFilter('All')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'All'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Field */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, MH Number, Mobile..."
              className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-medium placeholder:text-slate-400"
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
              <option value="Registration">New Registration (नवीन)</option>
              <option value="Renewal">Renewal (नूतनीकरण)</option>
            </select>
          </div>

          {/* Clear Filters & Data Slide Bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(searchQuery || selectedSourceType || statusFilter !== 'Pending') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSourceType('');
                    setStatusFilter('Pending');
                  }}
                  className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>

            {/* Slide Option (Left / Right Controls) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/60" title="Data Slide Option">
              <span className="text-[10px] font-bold text-slate-500 px-1.5">Slide:</span>
              <button
                onClick={handleScrollLeft}
                className="p-1.5 hover:bg-white hover:text-emerald-700 rounded-lg text-slate-600 transition cursor-pointer shadow-none hover:shadow-sm"
                title="Scroll Left"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleScrollRight}
                className="p-1.5 hover:bg-white hover:text-emerald-700 rounded-lg text-slate-600 transition cursor-pointer shadow-none hover:shadow-sm"
                title="Scroll Right"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filters Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Showing <strong className="text-slate-800">{filteredRecords.length}</strong> workers
            {statusFilter === 'Pending' && <span className="ml-1 text-amber-600 font-semibold">(Pending for WhatsApp Group)</span>}
            {statusFilter === 'Added' && <span className="ml-1 text-emerald-600 font-semibold">(Already Added to WhatsApp Group)</span>}
          </div>
          <div className="text-[11px] text-slate-400">
            MH Number is the primary identifier • Status persists across future renewals
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
              Only Active workers with valid MH numbers appear in WhatsApp Group tracking.
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
                  <th className="py-3.5 px-4 min-w-[140px]">WhatsApp Status</th>
                  <th className="py-3.5 px-4 min-w-[180px] text-right">Actions</th>
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
                        <span className="truncate max-w-[200px]" title={r.workerName}>
                          {r.workerName}
                        </span>
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
                            <span>Added</span>
                          </span>
                          {r.addedDate && (
                            <p className="text-[10px] text-slate-400 font-medium pl-1">
                              {r.addedDate} {r.addedBy ? `by ${r.addedBy}` : ''}
                            </p>
                          )}
                          {r.remark && (
                            <p className="text-[10px] text-slate-500 italic pl-1 truncate max-w-[150px]" title={r.remark}>
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
                        <button
                          onClick={() => {
                            setSelectedRecordForAdded(r);
                            setAddedRemark('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>☑ Added to WhatsApp Group</span>
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                          <ShieldCheck className="w-4 h-4 text-emerald-600" />
                          <span>Completed</span>
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

      {/* Modal: Mark as Added to WhatsApp Group */}
      {selectedRecordForAdded && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedRecordForAdded(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Add to WhatsApp Group
                </h3>
                <p className="text-xs text-slate-500">
                  व्हॉट्सअ‍ॅप ग्रुपमध्ये जोडल्याची नोंद करा
                </p>
              </div>
            </div>

            {/* Worker summary box */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Worker Name:</span>
                <span className="font-bold text-slate-800">{selectedRecordForAdded.workerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MH Number:</span>
                <span className="font-mono font-bold text-emerald-700">{selectedRecordForAdded.mhNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-mono text-slate-700">{selectedRecordForAdded.mobileNumber || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source:</span>
                <span className="font-semibold text-slate-700">
                  {selectedRecordForAdded.sourceType === 'Registration' ? 'New Registration' : 'Renewal'}
                </span>
              </div>
            </div>

            {/* Remark input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Remark / रिमार्क (Optional)
              </label>
              <input
                type="text"
                value={addedRemark}
                onChange={(e) => setAddedRemark(e.target.value)}
                placeholder="e.g. Added to MH-09 Group / Group Link sent"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-medium text-slate-800"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRecordForAdded(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMarkAsAdded}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/20 transition cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>Confirm Added</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
