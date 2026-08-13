import React, { useState } from 'react';
import {
  Search,
  UserCheck,
  Shield,
  Phone,
  CreditCard,
  Calendar,
  Award,
  RefreshCw,
  Eye,
  X,
  MapPin,
  Printer,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { WorkerRegistration, WorkerRenewal, WorkerClaim } from '../types';
import { MAHARASHTRA_TALUKAS } from '../data/mockData';
import { formatDate } from '../utils/exportUtils';

interface SearchModuleProps {
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  onOpenPrintSlip: (type: 'registration' | 'renewal' | 'claim', data: any) => void;
}

type SearchCategory = 'all' | 'registration' | 'renewal' | 'claim';

interface SearchResultItem {
  id: string;
  type: 'registration' | 'renewal' | 'claim';
  title: string;
  subTitle: string;
  mhNumber: string;
  workerName: string;
  mobileNumber: string;
  taluka: string;
  date: string;
  status: string;
  raw: WorkerRegistration | WorkerRenewal | WorkerClaim;
}

export const SearchModule: React.FC<SearchModuleProps> = ({
  registrations,
  renewals,
  claims,
  onOpenPrintSlip,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedResult, setSelectedResult] = useState<SearchResultItem | null>(null);
  const [selectedTaluka, setSelectedTaluka] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const q = query.trim().toLowerCase();
  const cleanQ = q.replace(/\s/g, '');

  const matchesCommonFilters = (
    itemTaluka?: string,
    itemStatus?: string,
    itemDate?: string
  ) => {
    if (selectedTaluka && itemTaluka !== selectedTaluka) return false;
    if (selectedStatus) {
      const s = itemStatus?.toLowerCase() || '';
      const sel = selectedStatus.toLowerCase();
      if (sel === 'active') {
        if (!(s === 'active' || s === 'accepted' || s === 'approved' || s === 'disbursed')) return false;
      } else if (sel === 'pending') {
        if (!(s === 'pending' || s === 'pending verification' || s === 'submitted' || s === 'under scrutiny')) return false;
      } else if (s !== sel) {
        return false;
      }
    }
    if (fromDate && itemDate && itemDate < fromDate) return false;
    if (toDate && itemDate && itemDate > toDate) return false;
    return true;
  };

  // Filter Registrations
  const matchedRegistrations: SearchResultItem[] = registrations
    .filter((r) => {
      if (!matchesCommonFilters(r.taluka, r.status, r.registrationDate)) return false;
      if (!q) return true;
      return (
        r.workerName.toLowerCase().includes(q) ||
        r.mhNumber.toLowerCase().includes(q) ||
        r.mobileNumber.includes(q) ||
        r.aadhaarNumber.replace(/\s/g, '').includes(cleanQ) ||
        r.id.toLowerCase().includes(q) ||
        (r.taluka && r.taluka.toLowerCase().includes(q)) ||
        (r.village && r.village.toLowerCase().includes(q))
      );
    })
    .map((r) => ({
      id: r.id,
      type: 'registration',
      title: r.workerName,
      subTitle: `MH No: ${r.status === 'Active' && r.mhNumber && !r.mhNumber.startsWith('PENDING-') ? r.mhNumber : 'Pending'}`,
      mhNumber: r.mhNumber,
      workerName: r.workerName,
      mobileNumber: r.mobileNumber,
      taluka: r.taluka || '',
      date: r.registrationDate,
      status: r.status,
      raw: r,
    }));

  // Filter Renewals
  const matchedRenewals: SearchResultItem[] = renewals
    .filter((ren) => {
      if (!matchesCommonFilters(ren.taluka, ren.status, ren.renewalDate)) return false;
      if (!q) return true;
      return (
        ren.workerName.toLowerCase().includes(q) ||
        ren.mhNumber.toLowerCase().includes(q) ||
        ren.mobileNumber.includes(q) ||
        ren.id.toLowerCase().includes(q) ||
        (ren.taluka && ren.taluka.toLowerCase().includes(q))
      );
    })
    .map((ren) => ({
      id: ren.id,
      type: 'renewal',
      title: ren.workerName,
      subTitle: `Renewal ID: ${ren.id} (${ren.renewalPeriodYears} Yrs)`,
      mhNumber: ren.mhNumber,
      workerName: ren.workerName,
      mobileNumber: ren.mobileNumber,
      taluka: ren.taluka || '',
      date: ren.renewalDate,
      status: ren.status || 'Active',
      raw: ren,
    }));

  // Filter Claims
  const matchedClaims: SearchResultItem[] = claims
    .filter((clm) => {
      if (!matchesCommonFilters(clm.taluka, clm.status, clm.claimDate)) return false;
      if (!q) return true;
      return (
        clm.workerName.toLowerCase().includes(q) ||
        clm.mhNumber.toLowerCase().includes(q) ||
        clm.mobileNumber.includes(q) ||
        clm.id.toLowerCase().includes(q) ||
        (clm.taluka && clm.taluka.toLowerCase().includes(q)) ||
        (clm.scheme1Name && clm.scheme1Name.toLowerCase().includes(q)) ||
        (clm.scheme2Name && clm.scheme2Name.toLowerCase().includes(q))
      );
    })
    .map((clm) => ({
      id: clm.id,
      type: 'claim',
      title: clm.workerName,
      subTitle: `Claim ID: ${clm.id} (₹${clm.totalAmount.toLocaleString('en-IN')})`,
      mhNumber: clm.mhNumber,
      workerName: clm.workerName,
      mobileNumber: clm.mobileNumber,
      taluka: clm.taluka || '',
      date: clm.claimDate,
      status: clm.status,
      raw: clm,
    }));

  // Combined Results based on active tab
  let results: SearchResultItem[] = [];
  if (activeCategory === 'all') {
    results = [...matchedRegistrations, ...matchedRenewals, ...matchedClaims];
  } else if (activeCategory === 'registration') {
    results = matchedRegistrations;
  } else if (activeCategory === 'renewal') {
    results = matchedRenewals;
  } else if (activeCategory === 'claim') {
    results = matchedClaims;
  }

  // Linked records helper for detail modal
  const selectedMhNumber = selectedResult?.mhNumber || '';
  const linkedRegistration = registrations.find(
    (r) => r.mhNumber.toLowerCase() === selectedMhNumber.toLowerCase()
  );
  const linkedRenewals = renewals.filter(
    (ren) => ren.mhNumber.toLowerCase() === selectedMhNumber.toLowerCase()
  );
  const linkedClaims = claims.filter(
    (clm) => clm.mhNumber.toLowerCase() === selectedMhNumber.toLowerCase()
  );

  const getTypeBadge = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'registration':
        return {
          label: 'New Registration',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: UserCheck,
        };
      case 'renewal':
        return {
          label: 'Renewal Entry',
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: RefreshCw,
        };
      case 'claim':
        return {
          label: 'Welfare Claim',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Award,
        };
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
      case 'Approved':
      case 'Disbursed':
      case 'Completed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Under Scrutiny':
      case 'Submitted':
      case 'Pending':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Big Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-700" />
            <span>Universal Search Engine (सार्वत्रिक शोध प्रणाली)</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Search across Registrations, Renewals, and Scheme Claims by MH Number, Name, Mobile, Aadhaar, or Record ID.
          </p>
        </div>

        {/* Search Bar Input */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-3.5 text-blue-700" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search MH Number, Worker Name, Mobile, Aadhaar, Claim ID, or Renewal ID..."
            className="w-full pl-12 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white shadow-xs font-medium"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3.5 top-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 bg-slate-200/60 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Multi-Criteria Filters Toolbar */}
        <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          {/* Taluka Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-blue-600" />
              <span>तालुका (Taluka Filter):</span>
            </label>
            <select
              value={selectedTaluka}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            >
              <option value="">सर्व तालुके (All Talukas)</option>
              {MAHARASHTRA_TALUKAS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-blue-600" />
              <span>स्थिती (Status Filter):</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            >
              <option value="">सर्व स्थिती (All Statuses)</option>
              <option value="Active">Active / स्वीकृत</option>
              <option value="Pending">Pending / प्रलंबित</option>
            </select>
          </div>

          {/* From Date Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-blue-600" />
              <span>पासून दिनांक (From Date):</span>
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* To Date Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-blue-600" />
              <span>पर्यंत दिनांक (To Date):</span>
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Clear Filters Indicator */}
        {(query || selectedTaluka || selectedStatus || fromDate || toDate) && (
          <div className="flex items-center justify-between text-xs bg-blue-50/80 border border-blue-200/80 px-3.5 py-2 rounded-xl">
            <span className="font-bold text-blue-900 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-700" />
              <span>फिल्टर लागू आहेत ({results.length} निकाल सापडले)</span>
            </span>
            <button
              onClick={() => {
                setQuery('');
                setSelectedTaluka('');
                setSelectedStatus('');
                setFromDate('');
                setToDate('');
              }}
              className="text-xs font-extrabold text-blue-800 hover:text-blue-950 underline cursor-pointer"
            >
              फिल्टर रिसेट करा (Clear All Filters)
            </button>
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 border-t border-slate-100">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>All Records</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-white/20">
              {matchedRegistrations.length + matchedRenewals.length + matchedClaims.length}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('registration')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'registration'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Registrations</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-slate-700">
              {matchedRegistrations.length}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('renewal')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'renewal'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Renewals</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-slate-700">
              {matchedRenewals.length}
            </span>
          </button>

          <button
            onClick={() => setActiveCategory('claim')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'claim'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Scheme Claims</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-slate-700">
              {matchedClaims.length}
            </span>
          </button>
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((item) => {
          const typeBadge = getTypeBadge(item.type);
          const TypeIcon = typeBadge.icon;

          return (
            <div
              key={`${item.type}-${item.id}`}
              onClick={() => setSelectedResult(item)}
              className="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-600/50 cursor-pointer transition-all shadow-xs hover:shadow-md group relative overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* Header: Type Badge & Status */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge.bg}`}>
                    <TypeIcon className="w-3 h-3" />
                    <span>{typeBadge.label}</span>
                  </span>

                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                    {item.status}
                  </span>
                </div>

                {/* Worker & Identifier */}
                <div className="mb-3">
                  <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                    {item.workerName}
                  </h3>
                  <div className="text-[11px] font-bold text-blue-700 font-mono mt-0.5">
                    {item.subTitle}
                  </div>
                </div>

                {/* Content details depending on type */}
                <div className="space-y-1 text-xs text-slate-700 pt-2 border-t border-slate-100 font-medium">
                  {item.type === 'registration' && (
                    <>
                      {item.mhNumber && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">MH Number:</span>
                          <span className="font-mono font-bold text-slate-900">{item.mhNumber}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">Mobile:</span>
                        <span className="font-mono text-slate-900">{item.mobileNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Aadhaar:</span>
                        <span className="font-mono text-slate-900">{(item.raw as WorkerRegistration).aadhaarNumber?.replace(/\s+/g, '')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Reg. Date:</span>
                        <span className="text-slate-800 font-semibold">{formatDate(item.date)}</span>
                      </div>
                    </>
                  )}

                  {item.type === 'renewal' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">MH Number:</span>
                        <span className="font-mono font-bold text-slate-900">{item.mhNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Renewal Period:</span>
                        <span className="font-semibold text-purple-800">{(item.raw as WorkerRenewal).renewalPeriodYears} Year(s)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Fee Paid:</span>
                        <span className="font-bold text-emerald-700">₹{(item.raw as WorkerRenewal).feeAmount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Renewal Date:</span>
                        <span className="text-slate-800 font-semibold">{formatDate(item.date)}</span>
                      </div>
                    </>
                  )}

                  {item.type === 'claim' && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">MH Number:</span>
                        <span className="font-mono font-bold text-slate-900">{item.mhNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Scheme:</span>
                        <span className="font-semibold text-slate-800 truncate max-w-[140px]" title={(item.raw as WorkerClaim).scheme1Name}>
                          {(item.raw as WorkerClaim).scheme1Name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Benefit Amount:</span>
                        <span className="font-extrabold text-amber-700">₹{(item.raw as WorkerClaim).totalAmount.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Claim Date:</span>
                        <span className="text-slate-800 font-semibold">{formatDate(item.date)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-2.5 flex items-center justify-between text-[11px] text-blue-700 font-bold border-t border-slate-100">
                <span>View Full Record Docket</span>
                <Eye className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}

        {results.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="font-semibold text-sm">कोणतीही नोंद आढळली नाही.</p>
            <p className="text-xs">No matching MBOCWW worker records found for "{query}".</p>
          </div>
        )}
      </div>

      {/* Selected Item Docket Modal */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto text-slate-900">
            <button
              onClick={() => setSelectedResult(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-4 mb-5 pb-4 border-b border-slate-200">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-800 border border-blue-200">
                {selectedResult.type === 'registration' && <UserCheck className="w-8 h-8" />}
                {selectedResult.type === 'renewal' && <RefreshCw className="w-8 h-8" />}
                {selectedResult.type === 'claim' && <Award className="w-8 h-8" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-slate-900">{selectedResult.workerName}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getTypeBadge(selectedResult.type).bg}`}>
                    {getTypeBadge(selectedResult.type).label}
                  </span>
                </div>
                <div className="text-xs font-bold text-blue-700 font-mono mt-0.5">
                  MH Registration No: {selectedResult.mhNumber || 'Pending'}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  Record ID: {selectedResult.id} • Date: {formatDate(selectedResult.date)}
                </div>
              </div>
            </div>

            {/* HIGHLIGHTED VERIFICATION DATE BANNER */}
            {selectedResult.type === 'registration' && (selectedResult.raw as WorkerRegistration).verificationDate && (
              <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-2 border-amber-400 text-amber-950 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-amber-800 font-extrabold flex items-center gap-1">
                      <span>Verification Date (तपासणी / पडताळणी तारीख)</span>
                    </div>
                    <div className="text-base font-black font-mono text-amber-950 mt-0.5">
                      {formatDate((selectedResult.raw as WorkerRegistration).verificationDate)}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 shadow-2xs">VERIFIED</span>
              </div>
            )}

            {selectedResult.type === 'renewal' && (selectedResult.raw as WorkerRenewal).verificationDate && (
              <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-2 border-amber-400 text-amber-950 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-amber-800 font-extrabold flex items-center gap-1">
                      <span>Verification Date (तपासणी / पडताळणी तारीख)</span>
                    </div>
                    <div className="text-base font-black font-mono text-amber-950 mt-0.5">
                      {formatDate((selectedResult.raw as WorkerRenewal).verificationDate)}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 shadow-2xs">VERIFIED</span>
              </div>
            )}

            {/* Item Specific Card */}
            {selectedResult.type === 'registration' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-6">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-slate-800">
                  <div className="font-bold text-blue-800 flex items-center gap-1.5 mb-2">
                    <UserCheck className="w-4 h-4" />
                    <span>Worker Info</span>
                  </div>
                  <div><span className="text-slate-500 font-medium">Worker Name:</span> <span className="font-semibold">{selectedResult.workerName}</span></div>
                  <div><span className="text-slate-500 font-medium">Mobile:</span> <span className="font-mono font-semibold">{selectedResult.mobileNumber}</span></div>
                  <div><span className="text-slate-500 font-medium">Aadhaar:</span> <span className="font-mono font-semibold">{(selectedResult.raw as WorkerRegistration).aadhaarNumber?.replace(/\s+/g, '')}</span></div>
                  {(selectedResult.raw as WorkerRegistration).dob && <div><span className="text-slate-500 font-medium">DOB:</span> <span className="font-mono font-semibold">{formatDate((selectedResult.raw as WorkerRegistration).dob)}</span></div>}
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-slate-800">
                  <div className="font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
                    <MapPin className="w-4 h-4" />
                    <span>Registration Details</span>
                  </div>
                  <div><span className="text-slate-500 font-medium">Taluka:</span> <span className="font-semibold">{selectedResult.taluka}</span></div>
                  <div><span className="text-slate-500 font-medium">Reg Date:</span> <span className="font-semibold">{formatDate((selectedResult.raw as WorkerRegistration).registrationDate)}</span></div>
                  <div><span className="text-slate-500 font-medium">Next Renewal:</span> <span className="font-semibold">{formatDate((selectedResult.raw as WorkerRegistration).nextRenewalDate)}</span></div>
                  <div><span className="text-slate-500 font-medium">Operator:</span> <span className="font-semibold">{(selectedResult.raw as WorkerRegistration).operatorName}</span></div>
                </div>
              </div>
            )}

            {selectedResult.type === 'renewal' && (
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 text-xs mb-6 space-y-2">
                <div className="font-bold text-purple-900 flex items-center gap-1.5 mb-1">
                  <RefreshCw className="w-4 h-4 text-purple-700" />
                  <span>Renewal Record Details</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  <div><span className="text-slate-500">Renewal ID:</span> <span className="font-mono font-bold">{selectedResult.id}</span></div>
                  <div><span className="text-slate-500">Period:</span> <span className="font-bold text-purple-800">{(selectedResult.raw as WorkerRenewal).renewalPeriodYears} Year(s)</span></div>
                  <div><span className="text-slate-500">Fee Amount:</span> <span className="font-bold text-emerald-700">₹{(selectedResult.raw as WorkerRenewal).feeAmount}</span></div>
                  <div><span className="text-slate-500">Renewal Date:</span> <span className="font-bold text-slate-900">{formatDate((selectedResult.raw as WorkerRenewal).renewalDate)}</span></div>
                  <div><span className="text-slate-500">New Valid Till:</span> <span className="font-bold text-emerald-800">{formatDate((selectedResult.raw as WorkerRenewal).validTill)}</span></div>
                  <div><span className="text-slate-500">Receipt No:</span> <span className="font-semibold">{(selectedResult.raw as WorkerRenewal).receiptNumber || 'N/A'}</span></div>
                  <div><span className="text-slate-500">Processed By:</span> <span className="font-semibold">{(selectedResult.raw as WorkerRenewal).operatorName}</span></div>
                </div>
              </div>
            )}

            {selectedResult.type === 'claim' && (
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-xs mb-6 space-y-2">
                <div className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
                  <Award className="w-4 h-4 text-amber-700" />
                  <span>Welfare Scheme Claim Details</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  <div><span className="text-slate-500">Claim ID:</span> <span className="font-mono font-bold">{selectedResult.id}</span></div>
                  <div><span className="text-slate-500">Status:</span> <span className="font-bold text-amber-800">{selectedResult.status}</span></div>
                  <div className="col-span-2"><span className="text-slate-500">Scheme 1:</span> <span className="font-bold text-slate-900">{(selectedResult.raw as WorkerClaim).scheme1Name}</span> (₹{(selectedResult.raw as WorkerClaim).scheme1Amount})</div>
                  {(selectedResult.raw as WorkerClaim).scheme2Name && (
                    <div className="col-span-2"><span className="text-slate-500">Scheme 2:</span> <span className="font-bold text-slate-900">{(selectedResult.raw as WorkerClaim).scheme2Name}</span> (₹{(selectedResult.raw as WorkerClaim).scheme2Amount})</div>
                  )}
                  <div><span className="text-slate-500">Total Benefit Amount:</span> <span className="font-extrabold text-emerald-700 text-sm">₹{(selectedResult.raw as WorkerClaim).totalAmount.toLocaleString('en-IN')}</span></div>
                  <div><span className="text-slate-500">Application Date:</span> <span className="font-semibold">{formatDate(selectedResult.date)}</span></div>
                  <div className="col-span-2"><span className="text-slate-500">Remarks:</span> <span className="font-medium text-slate-700">{(selectedResult.raw as WorkerClaim).remarks || 'N/A'}</span></div>
                </div>
              </div>
            )}

            {/* Linked Worker Dossier Summary */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-700" />
                <span>Complete Worker Portfolio & History (MH: {selectedMhNumber || 'N/A'})</span>
              </h4>

              {/* Linked Renewals */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
                  <span>Renewals ({linkedRenewals.length})</span>
                </div>
                {linkedRenewals.length > 0 ? (
                  <div className="space-y-1.5">
                    {linkedRenewals.map((r) => (
                      <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{r.id}</span> • {r.renewalPeriodYears} Year Renewal ({formatDate(r.renewalDate)})
                        </div>
                        <span className="font-bold text-emerald-700">₹{r.feeAmount} Paid</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">No renewals recorded for this worker.</p>
                )}
              </div>

              {/* Linked Claims */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-amber-600" />
                  <span>Scheme Claims ({linkedClaims.length})</span>
                </div>
                {linkedClaims.length > 0 ? (
                  <div className="space-y-1.5">
                    {linkedClaims.map((c) => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{c.scheme1Name}</span> ({c.status})
                        </div>
                        <span className="font-extrabold text-amber-700">₹{c.totalAmount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">No scheme claims submitted for this worker.</p>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-slate-200">
              <button
                onClick={() => onOpenPrintSlip(selectedResult.type, selectedResult.raw)}
                className="py-2.5 px-5 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print {selectedResult.type.toUpperCase()} Slip / Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
