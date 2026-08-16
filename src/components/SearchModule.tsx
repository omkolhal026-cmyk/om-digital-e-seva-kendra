import React, { useState, useMemo } from 'react';
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
  Copy,
  AlertTriangle,
  Layers,
  Users,
  Info,
  Check,
  ChevronRight,
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

export type SearchCategory = 'all' | 'registration' | 'renewal' | 'claim' | 'duplicate';
export type DuplicateCriterion = 'all' | 'aadhaar' | 'mhNumber' | 'mobile' | 'name';

export interface SearchResultItem {
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
  duplicateInfo?: {
    isDuplicate: boolean;
    reasons: string[];
    matchValues: { [key in DuplicateCriterion]?: string };
    totalMatches: number;
  };
}

export interface DuplicateCluster {
  id: string;
  criterion: 'aadhaar' | 'mhNumber' | 'mobile' | 'name';
  criterionLabel: string;
  criterionSubtext: string;
  matchKey: string;
  matchDisplayValue: string;
  items: SearchResultItem[];
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

  // Duplicate specific filters
  const [duplicateCriterion, setDuplicateCriterion] = useState<DuplicateCriterion>('all');
  const [selectedDuplicateClusterId, setSelectedDuplicateClusterId] = useState<string | null>(null);

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

  // 1. Build all raw items
  const allRegistrationsItems: SearchResultItem[] = useMemo(() => {
    return registrations.map((r) => ({
      id: r.id,
      type: 'registration' as const,
      title: r.workerName,
      subTitle: `MH No: ${r.status === 'Active' && r.mhNumber && !r.mhNumber.startsWith('PENDING-') ? r.mhNumber : 'Pending'}`,
      mhNumber: r.mhNumber || '',
      workerName: r.workerName || '',
      mobileNumber: r.mobileNumber || '',
      taluka: r.taluka || '',
      date: r.registrationDate || '',
      status: r.status || 'Pending',
      raw: r,
    }));
  }, [registrations]);

  const allRenewalsItems: SearchResultItem[] = useMemo(() => {
    return renewals.map((ren) => ({
      id: ren.id,
      type: 'renewal' as const,
      title: ren.workerName,
      subTitle: `Renewal ID: ${ren.id} (${ren.renewalPeriodYears} Yrs)`,
      mhNumber: ren.mhNumber || '',
      workerName: ren.workerName || '',
      mobileNumber: ren.mobileNumber || '',
      taluka: ren.taluka || '',
      date: ren.renewalDate || '',
      status: ren.status || 'Active',
      raw: ren,
    }));
  }, [renewals]);

  const allClaimsItems: SearchResultItem[] = useMemo(() => {
    return claims.map((clm) => ({
      id: clm.id,
      type: 'claim' as const,
      title: clm.workerName,
      subTitle: `Claim ID: ${clm.id} (₹${clm.totalAmount.toLocaleString('en-IN')})`,
      mhNumber: clm.mhNumber || '',
      workerName: clm.workerName || '',
      mobileNumber: clm.mobileNumber || '',
      taluka: clm.taluka || '',
      date: clm.claimDate || '',
      status: clm.status || 'Pending',
      raw: clm,
    }));
  }, [claims]);

  // 2. Detect and Cluster Duplicates (Double Entries)
  const { duplicateClusters, duplicateItemMap, duplicateCounts } = useMemo(() => {
    const aadhaarGroups = new Map<string, SearchResultItem[]>();
    const mhGroups = new Map<string, SearchResultItem[]>();
    const mobileGroups = new Map<string, SearchResultItem[]>();
    const nameGroups = new Map<string, SearchResultItem[]>();

    // Process registrations for duplicates
    allRegistrationsItems.forEach((item) => {
      const reg = item.raw as WorkerRegistration;
      
      // Aadhaar check
      const rawAadhaar = (reg.aadhaarNumber || '').replace(/\D/g, '');
      if (rawAadhaar.length === 12) {
        if (!aadhaarGroups.has(rawAadhaar)) aadhaarGroups.set(rawAadhaar, []);
        aadhaarGroups.get(rawAadhaar)!.push(item);
      }

      // MH Number check (across registrations)
      const rawMh = (reg.mhNumber || '').trim().toUpperCase();
      if (rawMh && !rawMh.startsWith('PENDING-')) {
        if (!mhGroups.has(rawMh)) mhGroups.set(rawMh, []);
        mhGroups.get(rawMh)!.push(item);
      }

      // Mobile Number check
      const rawMobile = (reg.mobileNumber || '').replace(/\D/g, '').slice(-10);
      if (rawMobile.length === 10 && rawMobile !== '0000000000') {
        if (!mobileGroups.has(rawMobile)) mobileGroups.set(rawMobile, []);
        mobileGroups.get(rawMobile)!.push(item);
      }

      // Worker Name check
      const rawName = (reg.workerName || '').trim().toLowerCase();
      if (rawName.length >= 3) {
        if (!nameGroups.has(rawName)) nameGroups.set(rawName, []);
        nameGroups.get(rawName)!.push(item);
      }
    });

    const clusters: DuplicateCluster[] = [];
    const itemMap = new Map<
      string,
      { isDuplicate: boolean; reasons: string[]; matchValues: { [key in DuplicateCriterion]?: string }; totalMatches: number }
    >();

    let aadhaarDupCount = 0;
    let mhDupCount = 0;
    let mobileDupCount = 0;
    let nameDupCount = 0;

    // Helper to register cluster and track items
    const recordCluster = (
      criterion: 'aadhaar' | 'mhNumber' | 'mobile' | 'name',
      criterionLabel: string,
      criterionSubtext: string,
      matchKey: string,
      matchDisplayValue: string,
      items: SearchResultItem[]
    ) => {
      if (items.length <= 1) return;

      clusters.push({
        id: `${criterion}-${matchKey}`,
        criterion,
        criterionLabel,
        criterionSubtext,
        matchKey,
        matchDisplayValue,
        items,
      });

      items.forEach((it) => {
        const existing = itemMap.get(it.id) || {
          isDuplicate: true,
          reasons: [],
          matchValues: {},
          totalMatches: 0,
        };
        if (!existing.reasons.includes(criterionLabel)) {
          existing.reasons.push(criterionLabel);
        }
        existing.matchValues[criterion] = matchDisplayValue;
        existing.totalMatches = Math.max(existing.totalMatches, items.length);
        itemMap.set(it.id, existing);
      });
    };

    // Build Aadhaar Clusters
    aadhaarGroups.forEach((items, cleanAadhaar) => {
      if (items.length > 1) {
        aadhaarDupCount++;
        const formattedAadhaar = cleanAadhaar.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
        recordCluster(
          'aadhaar',
          'समान आधार क्रमांक (Same Aadhaar)',
          `या आधार क्रमांकावर ${items.length} नोंदी आढळल्या आहेत`,
          cleanAadhaar,
          formattedAadhaar,
          items
        );
      }
    });

    // Build MH Number Clusters
    mhGroups.forEach((items, cleanMh) => {
      if (items.length > 1) {
        mhDupCount++;
        recordCluster(
          'mhNumber',
          'समान MH नंबर (Same MH Number)',
          `एकाच MH नोंदणी क्रमांकावर ${items.length} स्वतंत्र नोंदी आढळल्या`,
          cleanMh,
          cleanMh,
          items
        );
      }
    });

    // Build Mobile Number Clusters
    mobileGroups.forEach((items, cleanMobile) => {
      if (items.length > 1) {
        mobileDupCount++;
        recordCluster(
          'mobile',
          'समान मोबाईल क्रमांक (Same Mobile)',
          `एकाच मोबाईल नंबरवर ${items.length} नोंदी नोंदवल्या आहेत`,
          cleanMobile,
          cleanMobile,
          items
        );
      }
    });

    // Build Name Clusters
    nameGroups.forEach((items, cleanName) => {
      if (items.length > 1) {
        nameDupCount++;
        const displayName = items[0].workerName;
        recordCluster(
          'name',
          'समान कामगार नाव (Same Name)',
          `एकाच नावावर ${items.length} नोंदी उपलब्ध आहेत`,
          cleanName,
          displayName,
          items
        );
      }
    });

    return {
      duplicateClusters: clusters,
      duplicateItemMap: itemMap,
      duplicateCounts: {
        totalClusters: clusters.length,
        totalAadhaarClusters: aadhaarDupCount,
        totalMhClusters: mhDupCount,
        totalMobileClusters: mobileDupCount,
        totalNameClusters: nameDupCount,
        totalAffectedRecords: itemMap.size,
      },
    };
  }, [allRegistrationsItems]);

  // Attach duplicate info to all registration items
  const enrichedRegistrations: SearchResultItem[] = useMemo(() => {
    return allRegistrationsItems.map((item) => {
      const dupInfo = duplicateItemMap.get(item.id);
      return {
        ...item,
        duplicateInfo: dupInfo,
      };
    });
  }, [allRegistrationsItems, duplicateItemMap]);

  // Filtered Registrations by query & common filters
  const matchedRegistrations: SearchResultItem[] = useMemo(() => {
    return enrichedRegistrations.filter((r) => {
      if (!matchesCommonFilters(r.taluka, r.status, r.date)) return false;
      if (!q) return true;
      const raw = r.raw as WorkerRegistration;
      return (
        r.workerName.toLowerCase().includes(q) ||
        r.mhNumber.toLowerCase().includes(q) ||
        r.mobileNumber.includes(q) ||
        (raw.aadhaarNumber && raw.aadhaarNumber.replace(/\s/g, '').includes(cleanQ)) ||
        r.id.toLowerCase().includes(q) ||
        (r.taluka && r.taluka.toLowerCase().includes(q)) ||
        (raw.village && raw.village.toLowerCase().includes(q))
      );
    });
  }, [enrichedRegistrations, q, cleanQ, selectedTaluka, selectedStatus, fromDate, toDate]);

  // Filtered Renewals
  const matchedRenewals: SearchResultItem[] = useMemo(() => {
    return allRenewalsItems.filter((ren) => {
      if (!matchesCommonFilters(ren.taluka, ren.status, ren.date)) return false;
      if (!q) return true;
      return (
        ren.workerName.toLowerCase().includes(q) ||
        ren.mhNumber.toLowerCase().includes(q) ||
        ren.mobileNumber.includes(q) ||
        ren.id.toLowerCase().includes(q) ||
        (ren.taluka && ren.taluka.toLowerCase().includes(q))
      );
    });
  }, [allRenewalsItems, q, selectedTaluka, selectedStatus, fromDate, toDate]);

  // Filtered Claims
  const matchedClaims: SearchResultItem[] = useMemo(() => {
    return allClaimsItems.filter((clm) => {
      if (!matchesCommonFilters(clm.taluka, clm.status, clm.date)) return false;
      if (!q) return true;
      const raw = clm.raw as WorkerClaim;
      return (
        clm.workerName.toLowerCase().includes(q) ||
        clm.mhNumber.toLowerCase().includes(q) ||
        clm.mobileNumber.includes(q) ||
        clm.id.toLowerCase().includes(q) ||
        (clm.taluka && clm.taluka.toLowerCase().includes(q)) ||
        (raw.scheme1Name && raw.scheme1Name.toLowerCase().includes(q)) ||
        (raw.scheme2Name && raw.scheme2Name.toLowerCase().includes(q))
      );
    });
  }, [allClaimsItems, q, selectedTaluka, selectedStatus, fromDate, toDate]);

  // Filtered Duplicate Clusters based on user search and filters
  const filteredDuplicateClusters: DuplicateCluster[] = useMemo(() => {
    return duplicateClusters.filter((cluster) => {
      // 1. Criterion Filter
      if (duplicateCriterion !== 'all' && cluster.criterion !== duplicateCriterion) {
        return false;
      }

      // 2. Cluster ID selection if specifically targeted
      if (selectedDuplicateClusterId && cluster.id !== selectedDuplicateClusterId) {
        return false;
      }

      // 3. Search query match in cluster items or display value
      if (q) {
        const matchesKey = cluster.matchDisplayValue.toLowerCase().includes(q) || cluster.matchKey.toLowerCase().includes(q);
        const matchesAnyItem = cluster.items.some((it) => {
          const raw = it.raw as WorkerRegistration;
          return (
            it.workerName.toLowerCase().includes(q) ||
            it.mhNumber.toLowerCase().includes(q) ||
            it.mobileNumber.includes(q) ||
            it.id.toLowerCase().includes(q) ||
            it.taluka.toLowerCase().includes(q) ||
            (raw.aadhaarNumber && raw.aadhaarNumber.replace(/\s/g, '').includes(cleanQ))
          );
        });
        if (!matchesKey && !matchesAnyItem) return false;
      }

      // 4. Taluka filter (at least one item matches)
      if (selectedTaluka) {
        const hasTaluka = cluster.items.some((it) => it.taluka === selectedTaluka);
        if (!hasTaluka) return false;
      }

      // 5. Status filter
      if (selectedStatus) {
        const sel = selectedStatus.toLowerCase();
        const hasStatus = cluster.items.some((it) => {
          const s = it.status.toLowerCase();
          if (sel === 'active') return s === 'active' || s === 'approved' || s === 'completed';
          if (sel === 'pending') return s === 'pending' || s === 'pending verification';
          return s === sel;
        });
        if (!hasStatus) return false;
      }

      // 6. Date Range filter
      if (fromDate || toDate) {
        const hasDate = cluster.items.some((it) => {
          if (fromDate && it.date && it.date < fromDate) return false;
          if (toDate && it.date && it.date > toDate) return false;
          return true;
        });
        if (!hasDate) return false;
      }

      return true;
    });
  }, [
    duplicateClusters,
    duplicateCriterion,
    selectedDuplicateClusterId,
    q,
    cleanQ,
    selectedTaluka,
    selectedStatus,
    fromDate,
    toDate,
  ]);

  // Combined Results for standard tabs
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
    (r) => r.mhNumber && selectedMhNumber && r.mhNumber.toLowerCase() === selectedMhNumber.toLowerCase()
  );
  const linkedRenewals = renewals.filter(
    (ren) => ren.mhNumber && selectedMhNumber && ren.mhNumber.toLowerCase() === selectedMhNumber.toLowerCase()
  );
  const linkedClaims = claims.filter(
    (clm) => clm.mhNumber && selectedMhNumber && clm.mhNumber.toLowerCase() === selectedMhNumber.toLowerCase()
  );

  // If selected result is part of duplicate group, find all duplicate peer records
  const peerDuplicateRecords = useMemo(() => {
    if (!selectedResult || !selectedResult.duplicateInfo?.isDuplicate) return [];
    const selReg = selectedResult.raw as WorkerRegistration;
    const cleanAadhaar = selReg.aadhaarNumber?.replace(/\D/g, '');
    const cleanMh = selReg.mhNumber?.trim().toUpperCase();
    const cleanMobile = selReg.mobileNumber?.replace(/\D/g, '').slice(-10);

    return enrichedRegistrations.filter((it) => {
      if (it.id === selectedResult.id) return false;
      const r = it.raw as WorkerRegistration;
      if (cleanAadhaar && cleanAadhaar.length === 12 && r.aadhaarNumber?.replace(/\D/g, '') === cleanAadhaar) return true;
      if (cleanMh && !cleanMh.startsWith('PENDING-') && r.mhNumber?.trim().toUpperCase() === cleanMh) return true;
      if (cleanMobile && cleanMobile.length === 10 && cleanMobile !== '0000000000' && r.mobileNumber?.replace(/\D/g, '').slice(-10) === cleanMobile) return true;
      return false;
    });
  }, [selectedResult, enrichedRegistrations]);

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
      case 'Pending Verification':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Rejected':
      case 'Inactive':
      case 'Expired':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Big Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-700" />
              <span>Universal Search Engine (सार्वत्रिक शोध प्रणाली)</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Search across Registrations, Renewals, Scheme Claims, and Detect Double / Duplicate Entries.
            </p>
          </div>

          {/* Quick Duplicate Alert Banner / Trigger Button */}
          {duplicateCounts.totalClusters > 0 && (
            <button
              onClick={() => {
                setActiveCategory('duplicate');
                setSelectedDuplicateClusterId(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                activeCategory === 'duplicate'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-400/40'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 group-hover:text-amber-700" />
              <span>डबल नोंदी आढळल्या (Double Entries):</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white font-extrabold text-[11px]">
                {duplicateCounts.totalAffectedRecords} नोंदी ({duplicateCounts.totalClusters} गट)
              </span>
            </button>
          )}
        </div>

        {/* Search Bar Input */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-3.5 text-blue-700" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedDuplicateClusterId) setSelectedDuplicateClusterId(null);
            }}
            placeholder="Search MH Number, Worker Name, Mobile, Aadhaar, Claim ID, or Renewal ID..."
            className="w-full pl-12 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white shadow-xs font-medium"
            autoFocus
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                if (selectedDuplicateClusterId) setSelectedDuplicateClusterId(null);
              }}
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
        {(query || selectedTaluka || selectedStatus || fromDate || toDate || selectedDuplicateClusterId) && (
          <div className="flex items-center justify-between text-xs bg-blue-50/80 border border-blue-200/80 px-3.5 py-2 rounded-xl">
            <span className="font-bold text-blue-900 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-blue-700" />
              <span>
                फिल्टर लागू आहेत ({activeCategory === 'duplicate' ? `${filteredDuplicateClusters.length} डबल गट` : `${results.length} निकाल`} सापडले)
                {selectedDuplicateClusterId && ' • (विशिष्ट गट निवडला आहे)'}
              </span>
            </span>
            <button
              onClick={() => {
                setQuery('');
                setSelectedTaluka('');
                setSelectedStatus('');
                setFromDate('');
                setToDate('');
                setSelectedDuplicateClusterId(null);
              }}
              className="text-xs font-extrabold text-blue-800 hover:text-blue-950 underline cursor-pointer"
            >
              फिल्टर रिसेट करा (Clear All Filters)
            </button>
          </div>
        )}

        {/* Primary Category Tabs + Dedicated Double Entries Tab */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 border-t border-slate-100">
          <button
            onClick={() => {
              setActiveCategory('all');
              setSelectedDuplicateClusterId(null);
            }}
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
            onClick={() => {
              setActiveCategory('registration');
              setSelectedDuplicateClusterId(null);
            }}
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
            onClick={() => {
              setActiveCategory('renewal');
              setSelectedDuplicateClusterId(null);
            }}
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
            onClick={() => {
              setActiveCategory('claim');
              setSelectedDuplicateClusterId(null);
            }}
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

          {/* DEDICATED DOUBLE ENTRIES TAB */}
          <button
            onClick={() => {
              setActiveCategory('duplicate');
              setSelectedDuplicateClusterId(null);
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border ${
              activeCategory === 'duplicate'
                ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>डबल नोंदी (Double Entries)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-700 text-white font-extrabold">
              {duplicateCounts.totalAffectedRecords}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚠️ DEDICATED DOUBLE / DUPLICATE ENTRIES VIEW */}
      {/* ========================================================================= */}
      {activeCategory === 'duplicate' && (
        <div className="space-y-5">
          {/* Duplicate Filtering Toolbar & Summary Metrics */}
          <div className="bg-gradient-to-r from-amber-50 via-amber-100/50 to-orange-50 p-5 rounded-2xl border-2 border-amber-300 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                  <span>डबल / डुप्लिकेट नोंद शोध व तुलना (Duplicate Entry Detection)</span>
                </h3>
                <p className="text-xs text-amber-900/80 font-medium mt-0.5">
                  येथे एकाच कामगाराच्या आधार, MH नंबर, किंवा मोबाईल नंबरवर झालेल्या मल्टिपल/डबल नोंदी सहज ओळखा व तपासा.
                </p>
              </div>

              {/* Duplicate Quick Stats */}
              <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                <div className="bg-white/80 border border-amber-300 px-3 py-1.5 rounded-xl text-amber-900 shadow-2xs">
                  एकूण गट: <span className="text-amber-950 font-black">{filteredDuplicateClusters.length}</span>
                </div>
                <div className="bg-white/80 border border-amber-300 px-3 py-1.5 rounded-xl text-amber-900 shadow-2xs">
                  एकूण डबल नोंदी: <span className="text-amber-950 font-black">
                    {filteredDuplicateClusters.reduce((acc, c) => acc + c.items.length, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Choose / Filter Criteria (डबल नोंद कशावरून शोधायची ते निवडा) */}
            <div className="pt-3 border-t border-amber-200/80 space-y-2">
              <label className="block text-xs font-extrabold text-amber-950">
                डबल नोंद निकष निवडा (Choose Duplicate Match Criteria):
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setDuplicateCriterion('all');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'all'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>सर्व डबल नोंदी (All Types)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/10">
                    {duplicateCounts.totalClusters}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('aadhaar');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'aadhaar'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <span>समान आधार क्रमांक (Same Aadhaar)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-blue-100 text-blue-800 font-bold">
                    {duplicateCounts.totalAadhaarClusters} गट
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('mhNumber');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'mhNumber'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-purple-600" />
                  <span>समान MH नंबर (Same MH No)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-100 text-purple-800 font-bold">
                    {duplicateCounts.totalMhClusters} गट
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('mobile');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'mobile'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>समान मोबाईल नंबर (Same Mobile)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {duplicateCounts.totalMobileClusters} गट
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('name');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'name'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-slate-600" />
                  <span>समान नाव (Same Name)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-slate-800 font-bold">
                    {duplicateCounts.totalNameClusters} गट
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* DUPLICATE CLUSTERS LIST */}
          <div className="space-y-6">
            {filteredDuplicateClusters.map((cluster, idx) => (
              <div
                key={cluster.id}
                className="bg-white rounded-3xl border-2 border-amber-200 shadow-sm overflow-hidden transition-all hover:border-amber-400"
              >
                {/* Cluster Header */}
                <div className="bg-gradient-to-r from-amber-100/90 via-amber-50 to-orange-50 px-5 py-3.5 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-xl bg-amber-600 text-white text-xs font-black flex items-center justify-center shadow-2xs">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          {cluster.criterionLabel} :
                        </span>
                        <span className="font-mono font-black text-sm text-blue-900 bg-white/90 px-2.5 py-0.5 rounded-lg border border-amber-300 shadow-2xs">
                          {cluster.matchDisplayValue}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                          {cluster.items.length} नोंदी (Duplicates)
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                        {cluster.criterionSubtext}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500">तुलना करा (Compare Side-by-Side)</span>
                  </div>
                </div>

                {/* Duplicate Items Grid inside this cluster */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/40">
                  {cluster.items.map((item, itemIdx) => {
                    const reg = item.raw as WorkerRegistration;
                    const isVerified = Boolean(reg.verificationDate);

                    return (
                      <div
                        key={item.id}
                        className="bg-white p-4 rounded-2xl border border-slate-200/90 hover:border-blue-500 transition-all shadow-2xs flex flex-col justify-between group"
                      >
                        <div>
                          {/* Item Sub-header */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[10px] font-black uppercase text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              नोंद #{itemIdx + 1} (ID: {item.id})
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                              {item.status}
                            </span>
                          </div>

                          {/* Worker Name & MH */}
                          <h4 className="font-black text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                            {item.workerName}
                          </h4>
                          <div className="text-[11px] font-bold font-mono text-blue-700 mt-0.5">
                            MH No: {item.mhNumber && !item.mhNumber.startsWith('PENDING-') ? item.mhNumber : 'Pending'}
                          </div>

                          {/* Details Table */}
                          <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1 text-xs text-slate-700 font-medium">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Aadhaar:</span>
                              <span className="font-mono font-bold text-slate-900">
                                {reg.aadhaarNumber?.replace(/\s+/g, '') || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Mobile:</span>
                              <span className="font-mono text-slate-900">{item.mobileNumber || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Taluka:</span>
                              <span className="text-slate-900 font-semibold">{item.taluka || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Reg. Date:</span>
                              <span className="text-slate-900 font-bold">{formatDate(item.date)}</span>
                            </div>
                            {reg.verificationDate && (
                              <div className="flex justify-between text-amber-900 font-bold">
                                <span>पडताळणी तारीख:</span>
                                <span>{formatDate(reg.verificationDate)}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-slate-500">Operator:</span>
                              <span className="text-slate-700 font-semibold">{reg.operatorName || 'System'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <button
                            onClick={() => setSelectedResult(item)}
                            className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>तपशील पहा (Docket)</span>
                          </button>

                          <button
                            onClick={() => onOpenPrintSlip('registration', item.raw)}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center gap-1 border border-blue-200 cursor-pointer"
                            title="स्लिप प्रिंट करा"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print Slip</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {filteredDuplicateClusters.length === 0 && (
              <div className="p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500" />
                <h4 className="font-bold text-slate-800 text-base">कोणतीही डबल नोंद आढळली नाही!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  निवडलेल्या निकषांनुसार किंवा शोध परिणामांमध्ये एकही डुप्लिकेट नोंद सापडलेली नाही.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📋 STANDARD SEARCH RESULTS (ALL / REGISTRATION / RENEWAL / CLAIM) */}
      {/* ========================================================================= */}
      {activeCategory !== 'duplicate' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((item) => {
            const typeBadge = getTypeBadge(item.type);
            const TypeIcon = typeBadge.icon;
            const isDup = Boolean(item.duplicateInfo?.isDuplicate);

            return (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => setSelectedResult(item)}
                className={`p-5 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md group relative overflow-hidden flex flex-col justify-between ${
                  isDup
                    ? 'border-amber-300 hover:border-amber-500 bg-gradient-to-b from-amber-50/20 to-white'
                    : 'border-slate-200/90 hover:border-blue-600/50'
                }`}
              >
                <div>
                  {/* Header: Type Badge & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge.bg}`}>
                      <TypeIcon className="w-3 h-3" />
                      <span>{typeBadge.label}</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isDup && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCategory('duplicate');
                            // If aadhaar duplicate, set query to aadhaar
                            const reg = item.raw as WorkerRegistration;
                            if (reg.aadhaarNumber) {
                              setQuery(reg.aadhaarNumber.replace(/\D/g, ''));
                            } else {
                              setQuery(item.workerName);
                            }
                          }}
                          className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 flex items-center gap-1"
                          title="डबल नोंद तपासा"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-700" />
                          <span>Double ({item.duplicateInfo?.totalMatches}x)</span>
                        </button>
                      )}

                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
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
                          <span className="font-mono text-slate-900">
                            {(item.raw as WorkerRegistration).aadhaarNumber?.replace(/\s+/g, '')}
                          </span>
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
      )}

      {/* ========================================================================= */}
      {/* 🔍 SELECTED RECORD DOCKET MODAL */}
      {/* ========================================================================= */}
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

            {/* DOUBLE ENTRY WARNING BANNER IN MODAL */}
            {selectedResult.duplicateInfo?.isDuplicate && (
              <div className="mb-5 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-black text-sm text-amber-900">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span>⚠️ संभाव्य डबल नोंद (Potential Duplicate / Double Entry Detected)</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-950 font-black text-[10px] border border-amber-300">
                    {selectedResult.duplicateInfo.reasons.join(', ')}
                  </span>
                </div>
                <p className="text-xs text-amber-900/90 font-medium">
                  या कामगाराच्या संदर्भात सिस्टममध्ये इतर {peerDuplicateRecords.length} रेकॉर्ड्स उपलब्ध आहेत.
                </p>

                {peerDuplicateRecords.length > 0 && (
                  <div className="pt-2 border-t border-amber-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-amber-900 block">समान इतर नोंदी (Duplicate Peers):</span>
                    <div className="space-y-1">
                      {peerDuplicateRecords.map((peer) => (
                        <div
                          key={peer.id}
                          className="p-2 bg-white/90 rounded-xl border border-amber-200 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{peer.workerName}</span> • MH: {peer.mhNumber || 'Pending'} (ID: {peer.id})
                            <span className="text-slate-500 ml-1">[{formatDate(peer.date)}]</span>
                          </div>
                          <button
                            onClick={() => setSelectedResult(peer)}
                            className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[10px] border border-blue-200 cursor-pointer"
                          >
                            ही नोंद पहा
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
