import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  UserPlus,
  RefreshCw,
  Award,
  Search,
  Filter,
  Printer,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  UserCheck,
  Building2,
  Sparkles,
  Phone,
  Eye,
  FileText,
} from 'lucide-react';
import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  SubAgentUserSummary,
} from '../types';

interface SubAgentEntriesModuleProps {
  currentUser: User | null;
  initialSubAgentFilter?: string;
  onOpenPrintSlip?: (type: 'registration' | 'renewal' | 'claim', data: any) => void;
}

export const SubAgentEntriesModule: React.FC<SubAgentEntriesModuleProps> = ({
  currentUser,
  initialSubAgentFilter,
  onOpenPrintSlip,
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const isSubAgent = currentUser?.role === 'sub_agent';

  const [activeSubTab, setActiveSubTab] = useState<'all' | 'registrations' | 'renewals' | 'claims'>('all');
  const [selectedSubAgentId, setSelectedSubAgentId] = useState<string>(
    isSubAgent ? currentUser?.id || '' : initialSubAgentFilter || 'all'
  );

  const [subAgentsList, setSubAgentsList] = useState<SubAgentUserSummary[]>([]);
  const [registrations, setRegistrations] = useState<WorkerRegistration[]>([]);
  const [renewals, setRenewals] = useState<WorkerRenewal[]>([]);
  const [claims, setClaims] = useState<WorkerClaim[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentUser) {
      headers['x-user-id'] = currentUser.id;
      headers['x-user-username'] = currentUser.username;
    }
    return headers;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        // Load sub-agents list for the filter dropdown
        const saRes = await fetch('/api/sub-agents', { headers: getAuthHeaders() });
        if (saRes.ok) {
          const saData = await saRes.json();
          setSubAgentsList(Array.isArray(saData) ? saData : []);
        }
      }

      // Load entries
      const queryParam = selectedSubAgentId && selectedSubAgentId !== 'all' ? `?subAgentId=${selectedSubAgentId}` : '';
      const res = await fetch(`/api/sub-agent-entries${queryParam}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setRegistrations(Array.isArray(data.registrations) ? data.registrations : []);
        setRenewals(Array.isArray(data.renewals) ? data.renewals : []);
        setClaims(Array.isArray(data.claims) ? data.claims : []);
      }
    } catch (err) {
      console.error('Failed to load sub-agent entries:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedSubAgentId]);

  // Combined and filtered datasets
  const filteredRegistrations = useMemo(() => {
    return registrations.filter((r) => {
      const matchesSearch =
        r.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.mobileNumber.includes(searchQuery) ||
        r.aadhaarNumber.includes(searchQuery) ||
        (r.mhNumber && r.mhNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      const status = r.appStatus || r.status || 'Pending';
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'Pending'
          ? status === 'Pending' || status === 'Pending Verification'
          : statusFilter === 'Approved'
          ? status === 'Accepted' || status === 'Active'
          : status === statusFilter;

      const date = r.registrationDate || r.verificationDate || '';
      const matchesStart = !startDate || date >= startDate;
      const matchesEnd = !endDate || date <= endDate;

      return matchesSearch && matchesStatus && matchesStart && matchesEnd;
    });
  }, [registrations, searchQuery, statusFilter, startDate, endDate]);

  const filteredRenewals = useMemo(() => {
    return renewals.filter((r) => {
      const matchesSearch =
        r.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.mobileNumber.includes(searchQuery) ||
        (r.mhNumber && r.mhNumber.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'Pending'
          ? r.status === 'Pending'
          : statusFilter === 'Approved'
          ? r.status === 'Completed' || r.status === 'Active'
          : r.status === statusFilter;

      const date = r.renewalDate || r.verificationDate || '';
      const matchesStart = !startDate || date >= startDate;
      const matchesEnd = !endDate || date <= endDate;

      return matchesSearch && matchesStatus && matchesStart && matchesEnd;
    });
  }, [renewals, searchQuery, statusFilter, startDate, endDate]);

  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const matchesSearch =
        c.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.mobileNumber.includes(searchQuery) ||
        (c.mhNumber && c.mhNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        c.scheme1Name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'Pending'
          ? c.status === 'Submitted' || c.status === 'Under Scrutiny'
          : statusFilter === 'Approved'
          ? c.status === 'Approved' || c.status === 'Disbursed' || c.status === 'Payment Released'
          : c.status === statusFilter;

      const date = c.claimDate || '';
      const matchesStart = !startDate || date >= startDate;
      const matchesEnd = !endDate || date <= endDate;

      return matchesSearch && matchesStatus && matchesStart && matchesEnd;
    });
  }, [claims, searchQuery, statusFilter, startDate, endDate]);

  // Totals
  const totalRegCount = filteredRegistrations.length;
  const totalRenCount = filteredRenewals.length;
  const totalClmCount = filteredClaims.length;
  const totalEntriesCount = totalRegCount + totalRenCount + totalClmCount;

  const totalRegFees = filteredRegistrations.reduce((acc, r) => acc + (Number(r.feePaid) || 0), 0);
  const totalRenFees = filteredRenewals.reduce((acc, r) => acc + (Number(r.feeAmount) || 0), 0);
  const totalFees = totalRegFees + totalRenFees;

  // CSV Export
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    if (activeSubTab === 'registrations' || activeSubTab === 'all') {
      csvContent += 'REGISTRATIONS\n';
      csvContent += 'ID,Worker Name,Aadhaar,Mobile,Taluka,Date,Status,Fee,Created By\n';
      filteredRegistrations.forEach((r) => {
        csvContent += `"${r.id}","${r.workerName}","${r.aadhaarNumber}","${r.mobileNumber}","${r.taluka}","${r.registrationDate}","${r.appStatus || r.status}","${r.feePaid || 0}","${r.createdBy || 'N/A'}"\n`;
      });
      csvContent += '\n';
    }
    if (activeSubTab === 'renewals' || activeSubTab === 'all') {
      csvContent += 'RENEWALS\n';
      csvContent += 'ID,Worker Name,MH Number,Mobile,Renewal Date,Status,Fee,Created By\n';
      filteredRenewals.forEach((r) => {
        csvContent += `"${r.id}","${r.workerName}","${r.mhNumber}","${r.mobileNumber}","${r.renewalDate}","${r.status}","${r.feeAmount || 0}","${r.createdBy || 'N/A'}"\n`;
      });
      csvContent += '\n';
    }
    if (activeSubTab === 'claims' || activeSubTab === 'all') {
      csvContent += 'CLAIMS\n';
      csvContent += 'ID,Worker Name,MH Number,Mobile,Scheme Name,Amount,Claim Date,Status,Created By\n';
      filteredClaims.forEach((c) => {
        csvContent += `"${c.id}","${c.workerName}","${c.mhNumber}","${c.mobileNumber}","${c.scheme1Name}","${c.totalAmount || 0}","${c.claimDate}","${c.status}","${c.createdBy || 'N/A'}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sub_agent_entries_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-lg">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-300 uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>{isSubAgent ? 'My Workstation' : 'Sub-Agent Records Directory'}</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            {isSubAgent ? 'My Entries (माझ्या नोंदी)' : 'Sub-Agent Entries (सब-एजंट नोंदी)'}
          </h1>
          <p className="text-xs md:text-sm text-blue-200/80 mt-0.5">
            {isSubAgent
              ? 'View all registrations, renewals, and claims submitted by your account.'
              : 'Search and inspect all worker registrations, renewals, and claims created by Sub-Agents.'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all text-xs flex items-center gap-1.5"
            title="Refresh Entries"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Admin Sub-Agent Selector Filter */}
      {isAdmin && (
        <div className="p-4 rounded-2xl bg-white border border-blue-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600 shrink-0" />
            <div>
              <div className="text-xs font-bold text-slate-800">Filter By Sub-Agent (सब-एजंट निवडा)</div>
              <div className="text-[11px] text-slate-500">Select a specific agent or view all entries together</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSubAgentId}
              onChange={(e) => setSelectedSubAgentId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
            >
              <option value="all">⚡ All Sub-Agents (सर्व सब-एजंट्स)</option>
              {subAgentsList.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  👤 {agent.name} (@{agent.username} - {agent.mobile})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setActiveSubTab('all')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            activeSubTab === 'all'
              ? 'bg-blue-50/80 border-blue-400 ring-2 ring-blue-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Total Entries</span>
            <Layers className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalEntriesCount}</div>
          <div className="text-[10px] text-slate-500 mt-1">सर्व एकत्रित नोंदी</div>
        </div>

        <div
          onClick={() => setActiveSubTab('registrations')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            activeSubTab === 'registrations'
              ? 'bg-purple-50/80 border-purple-400 ring-2 ring-purple-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Registrations</span>
            <UserPlus className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-black text-purple-900">{totalRegCount}</div>
          <div className="text-[10px] text-purple-600 font-semibold mt-1">नवीन कामगार नोंदणी</div>
        </div>

        <div
          onClick={() => setActiveSubTab('renewals')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            activeSubTab === 'renewals'
              ? 'bg-indigo-50/80 border-indigo-400 ring-2 ring-indigo-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Renewals</span>
            <RefreshCw className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-900">{totalRenCount}</div>
          <div className="text-[10px] text-indigo-600 font-semibold mt-1">नूतनीकरण नोंदी</div>
        </div>

        <div
          onClick={() => setActiveSubTab('claims')}
          className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-xs ${
            activeSubTab === 'claims'
              ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-500/20'
              : 'bg-white border-slate-200/80 hover:bg-slate-50'
          }`}
        >
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Claims</span>
            <Award className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900">{totalClmCount}</div>
          <div className="text-[10px] text-amber-600 font-semibold mt-1">योजना क्लेम अर्ज</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-3">
        {/* Module Sub-Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setActiveSubTab('all')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Modules ({totalEntriesCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('registrations')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'registrations'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Registrations ({totalRegCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('renewals')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'renewals'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Renewals ({totalRenCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('claims')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
              activeSubTab === 'claims'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Claims ({totalClmCount})</span>
          </button>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Name, Mobile, MH, Aadhaar..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
            >
              <option value="all">All Status (सर्व स्थिती)</option>
              <option value="Pending">Pending (प्रलंबित)</option>
              <option value="Approved">Approved / Active (मंजूर)</option>
              <option value="Rejected">Rejected (नाकारले)</option>
            </select>
          </div>

          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              title="Start Date"
            />
          </div>

          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              title="End Date"
            />
          </div>
        </div>
      </div>

      {/* Main Tables */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          <div className="text-xs font-semibold text-slate-600">Loading Sub-Agent records...</div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: Registrations */}
          {(activeSubTab === 'all' || activeSubTab === 'registrations') && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 bg-purple-50/60 border-b border-purple-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-purple-700" />
                  <h2 className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                    Registration Entries ({filteredRegistrations.length})
                  </h2>
                </div>
                <span className="text-xs font-bold text-purple-800">
                  Total Fees: ₹{totalRegFees}
                </span>
              </div>

              {filteredRegistrations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No registration entries found matching the criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">Worker Name / Aadhaar</th>
                        <th className="p-3">MH Number</th>
                        <th className="p-3">Mobile & Taluka</th>
                        <th className="p-3">Reg Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Fee</th>
                        {isAdmin && <th className="p-3">Created By</th>}
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRegistrations.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{r.workerName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              Aadhaar: {r.aadhaarNumber ? `XXXX-XXXX-${r.aadhaarNumber.slice(-4)}` : 'N/A'}
                            </div>
                          </td>
                          <td className="p-3 font-mono font-bold text-blue-700">
                            {r.mhNumber || 'Pending Allotment'}
                          </td>
                          <td className="p-3">
                            <div className="font-mono text-slate-800">{r.mobileNumber}</div>
                            <div className="text-[11px] text-slate-500">{r.taluka || '-'}</div>
                          </td>
                          <td className="p-3 text-slate-600 font-mono">
                            {r.registrationDate || r.verificationDate || '-'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                (r.appStatus || r.status) === 'Accepted' || (r.appStatus || r.status) === 'Active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : (r.appStatus || r.status) === 'Rejected'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {r.appStatus || r.status || 'Pending'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-900 font-mono">
                            ₹{r.feePaid || 0}
                          </td>
                          {isAdmin && (
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-100">
                                {r.createdBy || r.operatorName || 'Sub-Agent'}
                              </span>
                            </td>
                          )}
                          <td className="p-3 text-right">
                            {onOpenPrintSlip && (
                              <button
                                type="button"
                                onClick={() => onOpenPrintSlip('registration', r)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-purple-50 text-purple-700 border border-slate-200 transition-colors"
                                title="Print Registration Receipt Slip"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: Renewals */}
          {(activeSubTab === 'all' || activeSubTab === 'renewals') && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 bg-indigo-50/60 border-b border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-indigo-700" />
                  <h2 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                    Renewal Entries ({filteredRenewals.length})
                  </h2>
                </div>
                <span className="text-xs font-bold text-indigo-800">
                  Total Fees: ₹{totalRenFees}
                </span>
              </div>

              {filteredRenewals.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No renewal entries found matching the criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">Worker Name</th>
                        <th className="p-3">MH Number</th>
                        <th className="p-3">Mobile & Taluka</th>
                        <th className="p-3">Renewal Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Fee</th>
                        {isAdmin && <th className="p-3">Created By</th>}
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRenewals.map((ren) => (
                        <tr key={ren.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{ren.workerName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">ID: {ren.id}</div>
                          </td>
                          <td className="p-3 font-mono font-bold text-indigo-700">
                            {ren.mhNumber}
                          </td>
                          <td className="p-3">
                            <div className="font-mono text-slate-800">{ren.mobileNumber}</div>
                            <div className="text-[11px] text-slate-500">{ren.taluka || '-'}</div>
                          </td>
                          <td className="p-3 text-slate-600 font-mono">
                            {ren.renewalDate || ren.verificationDate || '-'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                ren.status === 'Completed' || ren.status === 'Active'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : ren.status === 'Rejected'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {ren.status || 'Pending'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-900 font-mono">
                            ₹{ren.feeAmount || 0}
                          </td>
                          {isAdmin && (
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-100">
                                {ren.createdBy || ren.operatorName || 'Sub-Agent'}
                              </span>
                            </td>
                          )}
                          <td className="p-3 text-right">
                            {onOpenPrintSlip && (
                              <button
                                type="button"
                                onClick={() => onOpenPrintSlip('renewal', ren)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-indigo-50 text-indigo-700 border border-slate-200 transition-colors"
                                title="Print Renewal Receipt Slip"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: Claims */}
          {(activeSubTab === 'all' || activeSubTab === 'claims') && (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-4 bg-amber-50/60 border-b border-amber-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-700" />
                  <h2 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                    Claim Entries ({filteredClaims.length})
                  </h2>
                </div>
              </div>

              {filteredClaims.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No claim entries found matching the criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <tr>
                        <th className="p-3">Worker Name</th>
                        <th className="p-3">MH Number</th>
                        <th className="p-3">Scheme Name</th>
                        <th className="p-3">Claim Amount</th>
                        <th className="p-3">Claim Date</th>
                        <th className="p-3">Status</th>
                        {isAdmin && <th className="p-3">Created By</th>}
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredClaims.map((clm) => (
                        <tr key={clm.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{clm.workerName}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{clm.mobileNumber}</div>
                          </td>
                          <td className="p-3 font-mono font-bold text-amber-800">
                            {clm.mhNumber}
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-800">{clm.scheme1Name}</div>
                            {clm.scheme2Name && (
                              <div className="text-[11px] text-slate-500">+ {clm.scheme2Name}</div>
                            )}
                          </td>
                          <td className="p-3 font-bold text-emerald-700 font-mono">
                            ₹{clm.totalAmount?.toLocaleString('en-IN') || 0}
                          </td>
                          <td className="p-3 text-slate-600 font-mono">
                            {clm.claimDate || '-'}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                clm.status === 'Approved' || clm.status === 'Disbursed' || clm.status === 'Payment Released'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : clm.status === 'Rejected'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {clm.status || 'Submitted'}
                            </span>
                          </td>
                          {isAdmin && (
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-100">
                                {clm.createdBy || clm.operatorName || 'Sub-Agent'}
                              </span>
                            </td>
                          )}
                          <td className="p-3 text-right">
                            {onOpenPrintSlip && (
                              <button
                                type="button"
                                onClick={() => onOpenPrintSlip('claim', clm)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-amber-50 text-amber-700 border border-slate-200 transition-colors"
                                title="Print Claim Receipt Slip"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
